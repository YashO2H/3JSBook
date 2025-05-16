import { useEffect, useMemo, useRef, useState } from "react"
import { getPages, pageAtom } from './UI'
import {
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3
} from "three"
import { useCursor, useTexture } from "@react-three/drei"
import { useAtom } from "jotai"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"
import * as THREE from "three"
import { svgStringToPngBlobUrl } from "./HelperFunction"

const easingFactor = 0.5
const easingFactorFold = 0.3
const insideCurveStrength = 0.18
const outsideCurveStrength = 0.05
const turningCurveStrength = 0.09
const PAGE_SEGMENTS = 30

const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

const createPageGeometry = (depth , PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, isCover) => {
  const width = isCover ? COVER_WIDTH : PAGE_WIDTH
  const height = isCover ? COVER_HEIGTH : PAGE_HEIGHT
  const pageGeometry = new BoxGeometry(width, height, depth, PAGE_SEGMENTS, 2)
  pageGeometry.translate(width / 2, 0, 0)

  const position = pageGeometry.attributes.position
  const vertex = new Vector3()
  const skinIndexes = []
  const skinWeights = []

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    const x = vertex.x
    const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH))
    let skinWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH
    skinIndexes.push(skinIndex, skinIndex + 1, 0, 0)
    skinWeights.push(1 - skinWeight, skinWeight, 0, 0)
  }

  pageGeometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndexes, 4))
  pageGeometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4))

  return pageGeometry
}

export function Page({ number, page, opened, bookClosed, totalPages, pageImages, pageGeometry, coverGeometry, SEGMENT_WIDTH,SPINE_WIDTH,PAGE_DEPTH }) {
  const isCover = number === 0 || number === totalPages - 1

  const [pngUrl, setPngUrl] = useState(null);
const [pngUrl1, setPngUrl1] = useState(null);
const [ready, setReady] = useState(false);

useEffect(() => {
  (async () => {
    const frontUrl = await svgStringToPngBlobUrl(pageImages.front, 512, 512);
    const backUrl = await svgStringToPngBlobUrl(pageImages.back, 512, 512);
    setPngUrl(frontUrl);
    setPngUrl1(backUrl);
    setReady(true);
  })();
}, []);

const picture = useTexture(ready ? pngUrl : TRANSPARENT_PX);
const picture1 = useTexture(ready ? pngUrl1 : TRANSPARENT_PX);

  picture.colorSpace = picture1.colorSpace = THREE.SRGBColorSpace

  const group = useRef()
  const skinnedMeshRef = useRef()
  const turnedAt = useRef(0)
  const lastOpened = useRef(opened)
  const [highlighted, setHighlighted] = useState(false)
  useCursor(highlighted)

  const pageMaterials = useMemo(
    () => [
      new MeshStandardMaterial({ color: '#ffffff' }),
      new MeshStandardMaterial({ color: '#ffffff' }),
      new MeshStandardMaterial({ color: '#ffffff' }),
      new MeshStandardMaterial({ color: '#ffffff' }),
    ],
    []
  )

  const manualSkinnedMesh = useMemo(() => {
    const bones = []
    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      const bone = new Bone()
      bones.push(bone)
      bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH
      if (i > 0) bones[i - 1].add(bone)
    }
    const skeleton = new Skeleton(bones)
    const selectedGeometry = isCover ? coverGeometry : pageGeometry


    const materials = [
      ...pageMaterials,
      new MeshStandardMaterial({
        map: picture
      }),
      new MeshStandardMaterial({
        map: picture1
      }),
    ]

    const mesh = new SkinnedMesh(selectedGeometry, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.add(skeleton.bones[0])
    mesh.bind(skeleton)
    return mesh
  }, [picture, picture1])

  useFrame((_, delta) => {
    if (!skinnedMeshRef.current) return

    // highlight emissive
    const targetEmissive = highlighted ? 0.22 : 0
    skinnedMeshRef.current.material[4].emissiveIntensity = MathUtils.lerp(
      skinnedMeshRef.current.material[4].emissiveIntensity,
      targetEmissive,
      0.1
    )
    skinnedMeshRef.current.material[5].emissiveIntensity = MathUtils.lerp(
      skinnedMeshRef.current.material[5].emissiveIntensity,
      targetEmissive,
      0.1
    )

    // detect page-turn start
    if (lastOpened.current !== opened) turnedAt.current = Date.now()
    lastOpened.current = opened

    // compute turning progress
    let t = Math.min(400, Date.now() - turnedAt.current) / 400
    t = Math.sin(t * Math.PI)

    // group rotation
    let targetY = opened ? -Math.PI / 2 : Math.PI / 2
    targetY += number * 0.8 * (Math.PI / 180)
    easing.dampAngle(group.current.rotation, "y", targetY, easingFactor, delta)

    // bone rotations
    const bones = skinnedMeshRef.current.skeleton.bones
    const dynamicMultiplier = 0.06 + (0.082 - 0.06) * (50 - totalPages) / 30

    for (let i = 0; i < bones.length; i++) {
      const boneTarget = i === 0 ? group.current : bones[i]
      const insideI = i < 8 ? Math.sin(i * dynamicMultiplier) : 0
      const outsideI = i >= 8 ? Math.cos(i * 0.3) : 0
      const turnI = Math.sin(i * Math.PI / bones.length) * t

      let angle =
        insideCurveStrength * insideI * targetY -
        outsideCurveStrength * outsideI * targetY +
        turningCurveStrength * turnI * targetY

      let foldAngle = (Math.sign(targetY) * 2) * (Math.PI / 180)
      if (bookClosed) {
        angle = 0
        foldAngle = 0
      }

      easing.dampAngle(boneTarget.rotation, "y", angle, easingFactor, delta)
      const foldI = i > 8 ? Math.sin(i * Math.PI / bones.length - 0.5) * t : 0
      easing.dampAngle(bones[i].rotation, "x", foldAngle * foldI, easingFactorFold, delta)
    }
  })

  if (!picture) return null;


  return (
    <group
      ref={group}
      onPointerEnter={(e) => { e.stopPropagation(); setHighlighted(true) }}
      onPointerLeave={(e) => { e.stopPropagation(); setHighlighted(false) }}
    >
      <primitive ref={skinnedMeshRef} object={manualSkinnedMesh} />
    </group>
  )
}

export const NoSpineBook = ({
  pageImages = [],
  pageWidth,
  pageHeight,
  coverHeight,
  coverWidth,
  pageDepth,
  coverDepth,
  spineWidth,
  nextPage
}) => {
  const [page] = useAtom(pageAtom)
  const [delayedPage, setDelayedPage] = useState(page)
  const spine = pageImages[pageImages.length - 1]; 
  const pages = getPages(pageImages.slice(0, -1)); 
  const totalPages = pages?.length || 0
  const PAGE_WIDTH = pageWidth
  const PAGE_HEIGHT = pageHeight
  const COVER_WIDTH = coverWidth
  const COVER_HEIGTH = coverHeight
  const SEGMENT_WIDTH = COVER_WIDTH / PAGE_SEGMENTS
  const [_, setPage] = useAtom(pageAtom);
  const PAGE_DEPTH = pageDepth
  const COVER_DEPTH = coverDepth
  useEffect(() => {
    setPage(nextPage);
  }, [nextPage, setPage]);
  useEffect(() => {
    let timeout
    const goToPage = () => {
      setDelayedPage((dp) => {
        if (page === dp) return dp
        timeout = setTimeout(goToPage, Math.abs(page - dp) > 2 ? 50 : 150)
        return page > dp ? dp + 1 : dp - 1
      })
    }
    goToPage()
    return () => clearTimeout(timeout)
  }, [page])

  const pageGeometry = createPageGeometry(PAGE_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, false)
  const coverGeometry = createPageGeometry(COVER_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, true)

  // Calculate if the book is currently closed (either at the beginning or end)
  const bookClosed = delayedPage === 0 || delayedPage === totalPages

  return (
    <group rotation-y={Math.PI / 2}>
      {pages?.map((pageData, index) => (
        <Page
          key={index}
          page={delayedPage}
          number={index}
          pageGeometry={pageGeometry}
          coverGeometry={coverGeometry}
          opened={delayedPage > index}
          bookClosed={bookClosed}
          totalPages={totalPages}
          pageImages={pageData}
          SEGMENT_WIDTH={SEGMENT_WIDTH}
          SPINE_WIDTH={spineWidth}
          PAGE_DEPTH={PAGE_DEPTH}
          {...pageData}
        />
      ))}
    </group>
  )
}