import { useEffect, useMemo, useRef, useState } from "react"
import { pageAtom, pages } from "./UI"
import {
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3,
} from "three"
import { useCursor, useTexture } from "@react-three/drei"
import { useAtom } from "jotai"
import { useFrame, useLoader } from "@react-three/fiber"
import { degToRad } from "three/src/math/MathUtils.js"
import { easing } from "maath"
import * as THREE from "three"

// Animation and curve control constants
const easingFactor = 0.5
const easingFactorFold = 0.3
const insideCurveStrength = 0.18
const outsideCurveStrength = 0.05
const turningCurveStrength = 0.09

// Book dimensions
const PAGE_WIDTH = 1.28
const PAGE_HEIGHT = 1.71
const PAGE_DEPTH = 0.003
const COVER_DEPTH = 0.009
const COVER_EXTENSION = 0.05 // How much the cover extends beyond pages
const PAGE_SEGMENTS = 30
const RATIO = 1.05
const SEGMENT_WIDTH = (PAGE_WIDTH * RATIO) / PAGE_SEGMENTS

// Materials
const whiteColor = new Color("white")
const emissiveColor = new Color("orange")
const coverColor = new Color("#e8dbc5")

// Preload all textures
const preloadTextures = () => {
  useTexture.preload(`/textures/spine.jpg`)
  useTexture.preload(`/textures/book-cover.jpg`)
  useTexture.preload(`/textures/book-back.jpg`)
  useTexture.preload(`/textures/book-cover-roughness.jpg`)

  pages.forEach((page) => {
    useTexture.preload(`/textures/${page.front}.jpg`)
    useTexture.preload(`/textures/${page.back}.jpg`)
  })
}

// Create page geometry with custom depth and vertical-sensitive skin weights
const createPageGeometry = (depth = PAGE_DEPTH, isCover = false) => {
  const width = isCover ? PAGE_WIDTH * RATIO + COVER_EXTENSION : PAGE_WIDTH
  const height = isCover ? PAGE_HEIGHT * RATIO + COVER_EXTENSION : PAGE_HEIGHT
  const geometry = new BoxGeometry(width, height, depth, PAGE_SEGMENTS, 2)

  geometry.translate(width / 2, 0, 0)

  const position = geometry.attributes.position
  const vertex = new Vector3()
  const skinIndexes = []
  const skinWeights = []

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    const x = vertex.x
    const y = vertex.y

    // Determine the horizontal skin index and base weight from x
    const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH))
    const baseWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH

    // Calculate a vertical factor:
    // Bottom of the page (y = -height/2) => factor near 0 (minimal bending)
    // Top of the page (y = height/2) => factor near 1 (full bending influence)
    const verticalFactor = (y + height / 2) / height
    const weightAdjusted = baseWeight * verticalFactor

    skinIndexes.push(skinIndex, skinIndex + 1, 0, 0)
    skinWeights.push(1 - weightAdjusted, weightAdjusted, 0, 0)
  }

  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndexes, 4))
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4))

  return geometry
}

// Create geometries
const pageGeometry = createPageGeometry(PAGE_DEPTH, false)
const coverGeometry = createPageGeometry(COVER_DEPTH, true)

/**
 * SPINE COMPONENT
 * (Unchanged, except we allow pages as children so they inherit the spine's rotation)
 */
const Spine = ({ totalPages, currentPage, bookClosed, children }) => {
  const spineRef = useRef()

  // Calculate spine dimensions
  const SPINE_HEIGHT = PAGE_HEIGHT * RATIO + COVER_EXTENSION
  const SPINE_DEPTH = COVER_DEPTH
  const SPINE_WIDTH = PAGE_DEPTH * (totalPages - 2) // front/back covers excluded

  // Create spine geometry
  const spineGeometry = useMemo(() => {
    return new THREE.BoxGeometry(SPINE_WIDTH, SPINE_HEIGHT, SPINE_DEPTH, 20, 1, 1)
  }, [SPINE_WIDTH, SPINE_HEIGHT, SPINE_DEPTH])

  // Load spine texture
  const spineTexture = useLoader(THREE.TextureLoader, `/textures/spine.jpg`)
  spineTexture.colorSpace = SRGBColorSpace
  spineTexture.wrapS = THREE.ClampToEdgeWrapping
  spineTexture.wrapT = THREE.ClampToEdgeWrapping

  // Create materials
  const materials = useMemo(() => {
    const plainMaterial = new MeshStandardMaterial({
      color: coverColor,
      roughness: 0.3,
    })

    const texturedMaterial = new MeshStandardMaterial({
      map: spineTexture,
      roughness: 0.3,
      color: coverColor,
    })

    // BoxGeometry sides: [right, left, top, bottom, front, back]
    return [
      plainMaterial, // right
      plainMaterial, // left
      plainMaterial, // top
      plainMaterial, // bottom
      plainMaterial, // front (inner side)
      texturedMaterial, // back (outer side with texture)
    ]
  }, [spineTexture])

  // Same rotation logic you already had
  useFrame((_, delta) => {
    if (!spineRef.current) return

    // Calculate normalized progress
    const normalizedProgress =
      currentPage === 1 ? 0 : currentPage / (totalPages - 1)

    // Two-phase rotation logic
    const halfProgress = normalizedProgress * 2
    const targetRotation = new THREE.Euler(
      0,
      -Math.PI - (Math.PI / 2) * halfProgress,
      0
    )

    // Position
    const spinePosition = new THREE.Vector3(0, 0, 0)

    if (bookClosed) {
      // When book is closed
      easing.damp3(spineRef.current.position, spinePosition, easingFactor, delta)
      easing.dampE(
        spineRef.current.rotation,
        new THREE.Euler(0, Math.PI / 2, 0),
        easingFactor,
        delta
      )
    } else {
      // When book is opening
      easing.damp3(spineRef.current.position, spinePosition, easingFactor, delta)
      easing.dampE(spineRef.current.rotation, targetRotation, easingFactor, delta)
    }
  })

  return (
    <mesh
      ref={spineRef}
      geometry={spineGeometry}
      material={materials}
      castShadow
      receiveShadow
    >
      {/* 
        IMPORTANT: Pages are rendered as children here 
        so their base follows the spine's rotation.
      */}
      {children}
    </mesh>
  )
}

/**
 * COVER COMPONENT (unchanged)
 */
const Cover = ({ isBackCover, bookClosed, currentPage, totalPages, ...props }) => {
  const coverRef = useRef()
  const pivotRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [, setPage] = useAtom(pageAtom)

  // Load cover textures
  const [coverTexture, coverRoughness] = useTexture([
    `/textures/book-${isBackCover ? "back" : "cover"}.jpg`,
    `/textures/book-cover-roughness.jpg`,
  ])
  coverTexture.colorSpace = coverRoughness.colorSpace = SRGBColorSpace

  // Create cover material
  const coverMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: coverColor,
        map: coverTexture,
        roughness: 0.2,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    [coverTexture, coverRoughness]
  )

  const innerMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: coverColor,
        map: coverRoughness,
        roughness: 0.2,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    []
  )

  // Create skinned mesh
  const coverMesh = useMemo(() => {
    const bones = []
    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      const bone = new Bone()
      bones.push(bone)
      bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH
      if (i > 0) {
        bones[i - 1].add(bone)
      }
    }
    const skeleton = new Skeleton(bones)

    const materials = [
      innerMaterial, // left
      innerMaterial, // right
      innerMaterial, // top
      innerMaterial, // bottom
      isBackCover ? coverMaterial : innerMaterial, // back
      isBackCover ? innerMaterial : coverMaterial, // front
    ]

    const mesh = new SkinnedMesh(coverGeometry, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false

    mesh.add(skeleton.bones[0])
    mesh.bind(skeleton)
    return mesh
  }, [coverMaterial, innerMaterial, isBackCover])

  // Spine width for positioning
  const SPINE_WIDTH = PAGE_DEPTH * (totalPages - 2)

  // Same pivot logic you already had
  useFrame((_, delta) => {
    if (!coverRef.current || !pivotRef.current) return

    // Normalized progress
    const normalizedProgress =
      currentPage === 1 ? 0 : currentPage / (totalPages - 1)

    let targetPosition, targetRotation
    if (bookClosed) {
      // Covers are flat
      targetPosition = new THREE.Vector3(
        0,
        0,
        isBackCover ? SPINE_WIDTH / 2 : -SPINE_WIDTH / 2
      )
      targetRotation = 0
    } else {
      // Book open
      const coverSpread = SPINE_WIDTH / 2
      const angularSpread = Math.PI / 2
      const halfProgress = normalizedProgress * 2

      if (currentPage <= Math.floor(pages.length / 2)) {
        // front half
        targetRotation = isBackCover ? -angularSpread : angularSpread
        targetPosition = new THREE.Vector3(
          isBackCover
            ? SPINE_WIDTH / 2 - coverSpread * halfProgress
            : -SPINE_WIDTH / 2 + coverSpread * halfProgress,
          0,
          isBackCover ? coverSpread * halfProgress : -coverSpread * halfProgress
        )
      } else {
        // back half
        targetRotation = isBackCover ? -angularSpread : angularSpread
        targetPosition = new THREE.Vector3(
          isBackCover
            ? SPINE_WIDTH / 2 - coverSpread * halfProgress
            : -SPINE_WIDTH / 2 + coverSpread * halfProgress,
          0,
          isBackCover
            ? SPINE_WIDTH - coverSpread * halfProgress
            : -SPINE_WIDTH + coverSpread * halfProgress
        )
      }
    }

    easing.damp3(coverRef.current.position, targetPosition, easingFactor, delta)
    easing.dampAngle(
      pivotRef.current.rotation,
      "y",
      targetRotation,
      easingFactor,
      delta
    )
  })

  return (
    <group {...props} ref={coverRef}>
      <group ref={pivotRef}>
        <primitive
          object={coverMesh}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation()
            setPage(isBackCover ? totalPages : 0)
            setHovered(false)
          }}
        />
      </group>
    </group>
  )
}

/**
 * PAGE COMPONENT (modified for right-side curveness logic)
 */
const Page = ({
  number,
  front,
  back,
  page,
  opened,
  bookClosed,
  totalPages,
  ...props
}) => {
  const [clickedPage, setPage] = useAtom(pageAtom)
  const isCover = number === 0 || number === pages.length - 1
  const [picture, picture2] = useTexture([
    `/textures/${front}.jpg`,
    `/textures/${back}.jpg`,
  ])
  picture.colorSpace = SRGBColorSpace
  picture2.colorSpace = SRGBColorSpace

  const group = useRef()
  const turnedAt = useRef(0)
  const lastOpened = useRef(opened)
  const skinnedMeshRef = useRef()
  const [highlighted, setHighlighted] = useState(false)

  useCursor(highlighted)

  // Materials for regular pages
  const pageMaterials = useMemo(() => {
    return [
      new MeshStandardMaterial({ color: "white" }),
      new MeshStandardMaterial({ color: "white" }),
      new MeshStandardMaterial({ color: "white" }),
      new MeshStandardMaterial({ color: "white" }),
    ]
  }, [])

  // Create the skinned mesh
  const manualSkinnedMesh = useMemo(() => {
    const bones = []
    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      const bone = new Bone()
      bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH
      if (i > 0) bones[i - 1].add(bone)
      bones.push(bone)
    }
    const skeleton = new Skeleton(bones)

    const materials = [
      ...pageMaterials,
      new MeshStandardMaterial({
        color: whiteColor,
        map: picture,
        roughness: isCover ? 0.2 : 0.1,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
      new MeshStandardMaterial({
        color: whiteColor,
        map: picture2,
        roughness: isCover ? 0.2 : 0.1,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    ]

    const mesh = new SkinnedMesh(pageGeometry, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false

    mesh.add(skeleton.bones[0])
    mesh.bind(skeleton)
    return mesh
  }, [isCover, pageMaterials, picture, picture2])

  // Calculate spine width for positioning
  const SPINE_WIDTH = PAGE_DEPTH * (pages.length - 2)

  // Page-turn logic
  useFrame((_, delta) => {
    if (!skinnedMeshRef.current || !skinnedMeshRef.current.skeleton || !group.current)
      return

    // Track open/close timing changes
    if (lastOpened.current !== opened) {
      turnedAt.current = +new Date()
    }
    lastOpened.current = opened
    let turningTime = Math.min(400, new Date() - turnedAt.current) / 400
    turningTime = Math.sin(turningTime * -Math.PI)

    // Dynamic rotation calculation
    const middleIndex = (totalPages - 1) / 2
    let targetRotation = opened ? -Math.PI / 2 : -Math.PI / 2

    // Adjust rotation based on page position
    if (!bookClosed) {
      if (clickedPage > number) {
        targetRotation += degToRad(number * 0.8)
      } else {
        targetRotation += degToRad(number * 0.2)
      }
    }

    const normalizedProgress =
      clickedPage === 0 ? 0 : clickedPage / (totalPages - 1)
    const halfProgress = normalizedProgress * 2

    if (bookClosed) {
      // Flatten all pages
      easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta)
      skinnedMeshRef.current.skeleton.bones.forEach((b) => {
        easing.dampAngle(b.rotation, "y", 0, easingFactor, delta)
        easing.dampAngle(b.rotation, "x", 0, easingFactor, delta)
      })
    } else {
      if (clickedPage > number) {
        // RIGHT-SIDE PAGE TURNING LOGIC:
        const m = 1 - 2 * Math.abs(normalizedProgress - 0.5)
        const bones = skinnedMeshRef.current.skeleton.bones
        const dynamicMultiplier =
          0.159 + ((0.082 - 0.06) * (50 - pages.length)) / (50 - 20)

        for (let i = 0; i < bones.length; i++) {
          const insideCurveIntensity = i < 8 ? (1 - Math.sin(i * dynamicMultiplier)) : 0
          const outsideCurveIntensity = i >= 8
            ? (1 - Math.cos(((i - 8) / (PAGE_SEGMENTS - 8)) * Math.PI * 0.4))
            : 0
          const turningIntensity =
            Math.sin(i * Math.PI * (1 / bones.length)) * turningTime

          let rotationAngle =
            (insideCurveStrength * insideCurveIntensity * targetRotation -
              outsideCurveStrength * outsideCurveIntensity * targetRotation +
              turningCurveStrength * turningIntensity * targetRotation) * 3

          let foldRotationAngle = degToRad(Math.sign(targetRotation) * 2)
          if (bookClosed) {
            rotationAngle = 0
            foldRotationAngle = 0
          }

          easing.dampAngle(bones[i].rotation, "y", rotationAngle, easingFactor, delta)

          // Folding effect
          const foldIntensity =
            i > 8
              ? Math.sin((i * Math.PI) / bones.length - 0.5) * turningTime
              : 0

          easing.dampAngle(
            bones[i].rotation,
            "x",
            foldRotationAngle * foldIntensity,
            easingFactorFold,
            delta
          )
        }
      } else {
        if (clickedPage === 1) {
          easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta)
          skinnedMeshRef.current.skeleton.bones.forEach((b) => {
            easing.dampAngle(b.rotation, "y", 0, easingFactor, delta)
            easing.dampAngle(b.rotation, "x", 0, easingFactor, delta)
          })
        } 
        // else if (clickedPage < pages.length / 4) {
        //   const m = 1 - 2 * Math.abs(normalizedProgress - 0.5)
        //   easing.dampAngle(group.current.rotation, "y", targetRotation, easingFactor, delta)
        //   const bones = skinnedMeshRef.current.skeleton.bones
        //   const dynamicMultiplier =
        //     0.159 + ((0.082 - 0.06) * (50 - pages.length)) / (50 - 20)
        //   for (let i = 0; i < bones.length; i++) {
        //     const target = i === 0 ? group.current : bones[i]

        //     const insideCurveIntensity = i < 8
        //       ? -Math.sin(i * 0.2 + 0.25) * m
        //       : 0
        //     const outsideCurveIntensity = 0
        //     const turningIntensity =
        //       Math.sin(i * Math.PI * (1 / bones.length)) * turningTime
        //     let rotationAngle =
        //       (insideCurveStrength * insideCurveIntensity * targetRotation -
        //         outsideCurveStrength * outsideCurveIntensity * targetRotation +
        //         turningCurveStrength * turningIntensity * targetRotation)
        //     let foldRotationAngle = degToRad(Math.sign(targetRotation) * 2)
        //     if (bookClosed) {
        //       if (i === 0) {
        //         rotationAngle = targetRotation
        //         foldRotationAngle = 0
        //       } else {
        //         rotationAngle = 0
        //         foldRotationAngle = 0
        //       }
        //     }
        //     easing.dampAngle(
        //       bones[i].rotation,
        //       "y",
        //       rotationAngle,
        //       easingFactor,
        //       delta
        //     )

        //     const foldIntensity =
        //       i > 8
        //         ? Math.sin(i * Math.PI * (1 / bones.length) - 0.5) * turningTime
        //         : 0
        //     easing.dampAngle(
        //       target.rotation,
        //       "x",
        //       foldRotationAngle * foldIntensity,
        //       easingFactorFold,
        //       delta
        //     )
        //   }
        // } 
        else {
          const m = 1 - 2 * Math.abs(normalizedProgress - 0.5)
          easing.dampAngle(group.current.rotation, "y", targetRotation, easingFactor, delta)
          const bones = skinnedMeshRef.current.skeleton.bones
          const dynamicMultiplier =
            0.159 + ((0.082 - 0.06) * (50 - pages.length)) / (50 - 20)
          for (let i = 0; i < bones.length; i++) {
            const target = i === 0 ? group.current : bones[i]

            const insideCurveIntensity = i < 8 ? -Math.sin(i * 0.145) : 0;
            const outsideCurveIntensity = i >= 8
              ? (Math.cos(i * 0.1 + 0.25))
              : 0
            const turningIntensity =
              Math.sin(i * Math.PI * (1 / bones.length)) * turningTime
            let rotationAngle =
              (insideCurveStrength * insideCurveIntensity * targetRotation -
                outsideCurveStrength * outsideCurveIntensity * targetRotation +
                turningCurveStrength * turningIntensity * targetRotation)
            let foldRotationAngle = degToRad(Math.sign(targetRotation) * 2)
            if (bookClosed) {
              if (i === 0) {
                rotationAngle = targetRotation
                foldRotationAngle = 0
              } else {
                rotationAngle = 0
                foldRotationAngle = 0
              }
            }
            easing.dampAngle(
              bones[i].rotation,
              "y",
              rotationAngle,
              easingFactor,
              delta
            )

            const foldIntensity =
              i > 8
                ? Math.sin(i * Math.PI * (1 / bones.length) - 0.5) * turningTime
                : 0
            easing.dampAngle(
              target.rotation,
              "x",
              foldRotationAngle * foldIntensity,
              easingFactorFold,
              delta
            )
          }
        }
      }
    }
  })

  return (
    <group
      {...props}
      ref={group}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setHighlighted(true)
      }}
      onPointerLeave={(e) => {
        e.stopPropagation()
        setHighlighted(false)
      }}
      onClick={(e) => {
        e.stopPropagation()
        setPage(opened ? number : number + 1)
        setHighlighted(false)
      }}
    >
      <primitive
        ref={skinnedMeshRef}
        object={manualSkinnedMesh}
        position={[0, 0, SPINE_WIDTH / 2 - number * PAGE_DEPTH]}
      />
    </group>
  )
}

/**
 * MAIN BOOK COMPONENT
 * 
 * Note how we nest <Page/> inside <Spine/> so the pages' base
 * follows the spine's rotation exactly as you already defined it.
 */
export const Book = ({ ...props }) => {
  const [page, setPage] = useAtom(pageAtom)
  const [delayedPage, setDelayedPage] = useState(page)
  const totalPages = pages.length

  // Smooth page transitions
  useEffect(() => {
    let timeout
    const goToPage = () => {
      if (page === delayedPage) return
      const increment = page > delayedPage ? 1 : -1
      timeout = setTimeout(() => {
        setDelayedPage((prevPage) => prevPage + increment)
        goToPage()
      }, Math.abs(page - delayedPage) > 2 ? 50 : 150)
    }
    goToPage()
    return () => {
      clearTimeout(timeout)
    }
  }, [page, delayedPage])

  // Preload textures on mount
  useEffect(() => {
    try {
      preloadTextures()
    } catch (error) {
      console.error("Error preloading textures:", error)
    }
  }, [])

  // Determine if book is closed
  const bookClosed = delayedPage === 0 || delayedPage === totalPages

  return (
    <group
      {...props}
      onClick={(e) => {
        // Click background => close the book if open
        if (!bookClosed) {
          e.stopPropagation()
          setPage(0)
        }
      }}
    >
      <Cover
        isBackCover={false}
        bookClosed={bookClosed}
        currentPage={delayedPage}
        totalPages={totalPages}
      />

      {/**
       * SPINE is the parent of all the inner pages
       * => Their bases will rotate with the spine automatically.
       */}
      <Spine
        totalPages={totalPages}
        currentPage={delayedPage}
        bookClosed={bookClosed}
      >
        {/* 
          Inner Pages go here as children.
          We skip the very first and last (which are covers),
          so slice(1, -1). 
        */}
        {[...pages].slice(1, -1).map((pageData, index) => (
          <Page
            key={index}
            page={delayedPage}
            number={index + 1}
            opened={delayedPage > index + 1}
            bookClosed={bookClosed}
            totalPages={totalPages}
            {...pageData}
          />
        ))}
      </Spine>

      <Cover
        isBackCover={true}
        bookClosed={bookClosed}
        currentPage={delayedPage}
        totalPages={totalPages}
      />
    </group>
  )
}
