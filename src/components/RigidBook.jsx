import { useEffect, useMemo, useRef, useState } from "react"
import { pageAtom, pages } from './UI'
import { Bone, BoxGeometry, Color, Float32BufferAttribute, MathUtils, Mesh, MeshStandardMaterial, Skeleton, SkeletonHelper, SkinnedMesh, SRGBColorSpace, TextureLoader, Uint16BufferAttribute, Vector3 } from "three";
import * as THREE from "three";
import { useCursor, useTexture } from "@react-three/drei";
import { useAtom } from "jotai";
import { useFrame, useLoader } from "@react-three/fiber";
import { degToRad } from "three/src/math/MathUtils.js";
import { easing } from "maath";

const easingFactor = 0.05; //Control the page of easing
const easingFactorFold = 0.3
const insideCurveStrength = 0.18;
const outsideCurveStrength = 0.05;
const turningCurveStrength = 0.09;
const PAGE_WIDTH = 1.28;
const PAGE_HEIGHT = 1.71; //4:3 aspect ratio
const PAGE_DEPTH = 0.003;
const COVER_DEPTH = 0.009;
const PAGE_SEGMENTS = 30; // Divides the page for smoother bending
const RATIO = 1.05;
const SEGMENT_WIDTH = PAGE_WIDTH * RATIO / PAGE_SEGMENTS;
const PAGE_TURN_DURATION = 1.0; // Animation duration in seconds
const COVER_EXTENSION = 0.05;

// Create the geometry outside the component since it doesn't depend on props or state
const createPageGeometry = (depth = PAGE_DEPTH, isCover) => {
  const width = isCover ? PAGE_WIDTH * RATIO + COVER_EXTENSION : PAGE_WIDTH;
  const height = isCover ? PAGE_HEIGHT * RATIO + COVER_EXTENSION: PAGE_HEIGHT;
  const pageGeometry = new BoxGeometry(
    width,
    height,
    depth,
    PAGE_SEGMENTS,
    2
  );

  pageGeometry.translate(width / 2, 0, 0);

  const position = pageGeometry.attributes.position;
  const vertex = new Vector3();
  const skinIndexes = [];
  const skinWeights = [];

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const x = vertex.x;
    const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH));
    let skinWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH;

    skinIndexes.push(skinIndex, skinIndex + 1, 0, 0);
    skinWeights.push(1 - skinWeight, skinWeight, 0, 0);
  }

  pageGeometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndexes, 4));
  pageGeometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));

  return pageGeometry;
}

const pageGeometry = createPageGeometry(PAGE_DEPTH, false);
const coverGeometry = createPageGeometry(COVER_DEPTH, true);
const whiteColor = new Color("white");
const emissiveColor = new Color("orange");
const coverColor = new Color("#e8dbc5");

// Preload textures function (to be called within a component)
const preloadTextures = () => {

  // Preload page textures
  pages.forEach((page) => {
    useTexture.preload(`/textures/${page.front}.jpg`);
    useTexture.preload(`/textures/${page.back}.jpg`);
    useTexture.preload(`/textures/book-cover-roughness.png`);
  });
};

// Spine component as a separate mesh
const SpineFolded = ({ totalPages, currentPage, bookClosed }) => {
  const spineMainRef = useRef();
  const spineLeftFoldRef = useRef();
  const spineRightFoldRef = useRef();
  const spineGroupRef = useRef();

  const SPINE_HEIGHT = PAGE_HEIGHT* RATIO + COVER_EXTENSION ;
  const SPINE_DEPTH = COVER_DEPTH;                  // visible spine thickness
  const SPINE_WIDTH = PAGE_DEPTH * (totalPages - 2); // page‑stack thickness
  const FOLD_WIDTH = SPINE_WIDTH * 0.15;
  const MAIN_WIDTH = SPINE_WIDTH - 2 * FOLD_WIDTH;

  // load texture
  const spineTexture = useLoader(TextureLoader, `/textures/spine.jpg`);
  spineTexture.colorSpace = SRGBColorSpace;
  spineTexture.wrapS = THREE.ClampToEdgeWrapping;
  spineTexture.wrapT = THREE.ClampToEdgeWrapping;

  // materials
  const materials = useMemo(() => {
    const base = {
      roughness: 0.3,
      depthWrite: true,
      depthTest: true,
    };
    return [
      new MeshStandardMaterial({ ...base, color: coverColor }),
      new MeshStandardMaterial({ ...base, map: spineTexture, color: coverColor }),
    ];
  }, [spineTexture]);

  useFrame((_, delta) => {
    if (!spineGroupRef.current) return;
    // compute foldAngle…
    const q = totalPages / 4;
    const tq = (3 * totalPages) / 4;
    let foldAngle = 0;
    if (currentPage <= q) foldAngle = (currentPage / q) * (Math.PI / 3);
    else if (currentPage < tq) foldAngle = Math.PI / 3;
    else foldAngle = ((totalPages - currentPage) / (totalPages - tq)) * (Math.PI / 3);

    // positions & rotations…
    const spinePos = new THREE.Vector3(
      bookClosed || currentPage === 1 || currentPage === totalPages - 1 ? 0 : (currentPage < totalPages/2 ? -0.01 : -0.01),
      0,
      -SPINE_WIDTH / 2
    );

    // main rotation
    const mainRot = bookClosed
      ? new THREE.Euler(0, Math.PI/2, 0)
      : new THREE.Euler(0, 0, 0);

    // apply folds
    if (!bookClosed) {
      spineLeftFoldRef.current.rotation.y = -foldAngle;
      spineRightFoldRef.current.rotation.y = foldAngle;
    } else {
      spineLeftFoldRef.current.rotation.y = 0;
      spineRightFoldRef.current.rotation.y = 0;
    }

    // damp transforms
    easing.damp3(spineGroupRef.current.position, spinePos, easingFactor, delta);
    easing.dampE(spineMainRef.current.rotation, mainRot, easingFactor, delta);

    // optional group rotation
    if (!bookClosed) {
      const fullRot = -Math.PI * (currentPage / totalPages);
      easing.dampE(spineGroupRef.current.rotation, new THREE.Euler(0, fullRot, 0), easingFactor, delta);
    }
  });

  return (
    <group ref={spineGroupRef} >

      {/* visible cover‑thick spine */}
      <mesh ref={spineMainRef} castShadow receiveShadow>
        <boxGeometry args={[MAIN_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]} />
        <meshStandardMaterial map={spineTexture} roughness={0.3} color={coverColor} />
        {/* left fold */}
        <group ref={spineLeftFoldRef} position={[-MAIN_WIDTH/2,0,0]}>
          <mesh position={[-FOLD_WIDTH/2,0,0]} castShadow receiveShadow>
            <boxGeometry args={[FOLD_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]} />
            <meshStandardMaterial roughness={0.3} color={coverColor} />
          </mesh>
        </group>
        {/* right fold */}
        <group ref={spineRightFoldRef} position={[MAIN_WIDTH/2,0,0]}>
          <mesh position={[FOLD_WIDTH/2,0,0]} castShadow receiveShadow>
            <boxGeometry args={[FOLD_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]} />
            <meshStandardMaterial roughness={0.3} color={coverColor} />
          </mesh>
        </group>
      </mesh>
    </group>
  );
};


// Cover component (for both front and back)
// Cover component (for both front and back)
const Cover = ({ isBackCover, bookClosed, currentPage, totalPages, ...props }) => {
  const coverRef = useRef();
  const pivotRef = useRef();
  const spineConnectionRef = useRef(); // Reference for spine connection point
  const [hovered, setHovered] = useState(false);
  const [, setPage] = useAtom(pageAtom);

  // Load cover textures
  const [coverTexture, coverRoughness] = useTexture([
    `/textures/book-${isBackCover ? "back" : "cover"}.jpg`,
    `/textures/book-cover-roughness.png`,
  ]);
  coverTexture.colorSpace = coverRoughness.colorSpace = SRGBColorSpace;

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
  );

  const innerMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: coverColor,
        roughness: 0.2,
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    []
  );

  // Create skinned mesh
  const coverMesh = useMemo(() => {
    const bones = [];
    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      const bone = new Bone();
      bones.push(bone);
      bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH;
      if (i > 0) {
        bones[i - 1].add(bone);
      }
    }
    const skeleton = new Skeleton(bones);

    const materials = [
      innerMaterial, // left
      innerMaterial, // right
      innerMaterial, // top
      innerMaterial, // bottom
      isBackCover ? coverMaterial : innerMaterial, // back
      isBackCover ? innerMaterial : coverMaterial, // front
    ];

    const mesh = new SkinnedMesh(coverGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    return mesh;
  }, [coverMaterial, innerMaterial, isBackCover]);

  // Spine width for positioning
  const SPINE_WIDTH = PAGE_DEPTH * (totalPages - 2);
  const FOLD_WIDTH = SPINE_WIDTH * 0.15; // Match with SpineFolded component

  useFrame((_, delta) => {
    if (!coverRef.current || !pivotRef.current) return;

    // Normalized progress
    const normalizedProgress = currentPage / (totalPages - 2);

    let targetPosition, targetRotation;
    if (bookClosed) {
      // Covers are flat
      targetPosition = new THREE.Vector3(
        0,
        0,
        isBackCover ? 0 : -SPINE_WIDTH
      );
      targetRotation = 0;
    } else {
      // Book open
      const coverSpread = SPINE_WIDTH / 2;
      const angularSpread = Math.PI / 2;
      const halfProgress = normalizedProgress * 2;

      if (currentPage <= Math.floor((pages.length - 2) / 2)) {
        // front half
        targetRotation = isBackCover ? -angularSpread : angularSpread;
        targetPosition = new THREE.Vector3(
          isBackCover
            ? SPINE_WIDTH / 2 - coverSpread * halfProgress
            : -SPINE_WIDTH / 2 + coverSpread * halfProgress,
          0,
          isBackCover ? coverSpread * halfProgress - SPINE_WIDTH / 2 : -coverSpread * halfProgress - SPINE_WIDTH / 2
        );
      } else {
        // back half
        targetRotation = isBackCover ? -angularSpread : angularSpread;
        targetPosition = new THREE.Vector3(
          isBackCover
            ? SPINE_WIDTH / 2 - coverSpread * halfProgress
            : -SPINE_WIDTH / 2 + coverSpread * halfProgress,
          0,
          isBackCover
            ? SPINE_WIDTH - coverSpread * halfProgress - SPINE_WIDTH / 2
            : -SPINE_WIDTH + coverSpread * halfProgress - SPINE_WIDTH / 2
        );
      }
    }

    // Set the spine connection point position for better connection
    if (spineConnectionRef.current) {
      const edgePosition = isBackCover ? -PAGE_WIDTH * RATIO : PAGE_WIDTH * RATIO;
      spineConnectionRef.current.position.x = edgePosition;
    }

    easing.damp3(coverRef.current.position, targetPosition, bookClosed ? 0.05 : easingFactor, delta);
    easing.dampAngle(
      pivotRef.current.rotation,
      "y",
      targetRotation,
      bookClosed ? 0.05 : easingFactor,
      delta
    );
  });

  return (
    <group {...props} ref={coverRef}>
      <group ref={pivotRef}>
        <primitive
          object={coverMesh}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            setPage(isBackCover ? totalPages : 0);
            setHovered(false);
          }}
        />
        {/* Spine connection point */}
        <group
          ref={spineConnectionRef}
          position={[isBackCover ? -PAGE_WIDTH * RATIO : PAGE_WIDTH * RATIO, 0, 0]}
        />
      </group>
    </group>
  );
};

const Page = ({ number, front, back, page, opened, bookClosed, ...props }) => {
  // Load textures inside the component
  const [picture, picture2, ...[pictureRoughness]] = useTexture([
    `/textures/${front}.jpg`,
    `/textures/${back}.jpg`,
    ...(number === 0 || number === pages.length - 1 ? [`/textures/book-cover-roughness.png`] : [])
  ]);

  picture.colorSpace = picture2.colorSpace = SRGBColorSpace;


  const group = useRef();
  const turnedAt = useRef(0);
  const lastOpened = useRef(opened);
  const animationProgress = useRef(opened ? 1 : 0); // Track animation progress
  const isAnimating = useRef(false);
  const skinnedMeshRef = useRef();
  const [_, setPage] = useAtom(pageAtom);
  const [highlighted, setHighlighted] = useState(false);
  useCursor(highlighted);

  const pageMaterials = useMemo(() => [
    new MeshStandardMaterial({ color: 'white' }),  // Front material
    // new MeshStandardMaterial({ 
    //     map: spineTexture[0],
    //     roughness: 0.8,
    //     metalness: 0.1,
    //     // Fallback if texture fails to load
    //     onError: (error) => {uvAttribute
    //       console.error("Error loading spine texture:", error);
    //     }
    //   }),
    new MeshStandardMaterial({ color: 'white' }),
    new MeshStandardMaterial({ color: 'white' }),
    new MeshStandardMaterial({ color: 'white' }),
  ], []);

  const manualSkinnedMesh = useMemo(() => {
    const materials = [
      ...pageMaterials,
      new MeshStandardMaterial({
        color: whiteColor,
        map: picture,
        ...(number === 0 ?
          { roughnessMap: pictureRoughness } : { roughness: 0.1 }),
        emissive: emissiveColor,
        emissiveIntensity: 0
      }),
      new MeshStandardMaterial({
        color: whiteColor,
        map: picture2,
        ...(number === pages.length - 1 ? {
          roughnessMap: pictureRoughness
        } : { roughness: 0.1 }),
        emissive: emissiveColor,
        emissiveIntensity: 0
      })
    ];

    const selectedGeometry = pageGeometry;
    const mesh = new Mesh(selectedGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    return mesh;
  }, [picture, picture2, pictureRoughness, pageMaterials, number]);

  useFrame((_, delta) => {
    if (!skinnedMeshRef.current || !group.current) {
      return;
    }

    // Handle highlight effect
    const emissiveIntensity = highlighted ? 0.22 : 0;
    skinnedMeshRef.current.material[4].emissiveIntensity =
      skinnedMeshRef.current.material[5].emissiveIntensity = MathUtils.lerp(
        skinnedMeshRef.current.material[4].emissiveIntensity,
        emissiveIntensity,
        0.1
      );

    // Check if opened state changed
    if (lastOpened.current !== opened) {
      turnedAt.current = performance.now();
      lastOpened.current = opened;
      isAnimating.current = true;
    }

    // Calculate animation progress
    if (isAnimating.current) {
      const elapsedTime = (performance.now() - turnedAt.current) / 1000;
      const targetProgress = opened ? 1 : 0;

      // Calculate smooth animation progress
      const duration = PAGE_TURN_DURATION;
      let progress = elapsedTime / duration;

      // Apply easing function for smooth animation
      if (progress < 1) {
        // Ease in-out function for smoother animation
        progress = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        animationProgress.current = opened
          ? progress
          : 1 - progress;
      } else {
        animationProgress.current = targetProgress;
        isAnimating.current = false;
      }
    }

    // Apply rotation based on animation progress
    const targetRotation = -Math.PI * animationProgress.current;
    group.current.rotation.y = targetRotation;
  });

  return (
    <group {...props} ref={group}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHighlighted(true);
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        setHighlighted(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setPage(opened ? number : number + 1);
        setHighlighted(false);
      }}
    >
      <primitive
        ref={skinnedMeshRef}
        object={manualSkinnedMesh}
        position-z={-number * PAGE_DEPTH + page * PAGE_DEPTH}
      />
    </group>
  )
};

export const RigidBook = ({ ...props }) => {
  const [page] = useAtom(pageAtom)
  const [delayedPage, setDelayedPage] = useState(page)
  const totalPages = pages.length
  const bookRef = useRef()

  useEffect(preloadTextures, [])

  // smooth page stepping
  useEffect(() => {
    let timeout
    const step = () => {
      setDelayedPage(dp => {
        if (dp === page) return dp
        timeout = setTimeout(step, Math.abs(page - dp) > 2 ? 50 : 150)
        return page > dp ? dp + 1 : dp - 1
      })
    }
    step()
    return () => clearTimeout(timeout)
  }, [page])

  const bookClosed = delayedPage === 0 || delayedPage === totalPages

  //
  // ——— DYNAMIC OPEN‑BOOK OFFSETS ———
  //
  const SPINE_WIDTH = PAGE_DEPTH * (totalPages - 2)

  // these factors control how “wide” and “deep” the open book is
  const OPEN_X_FACTOR        = 0.6
  const OPEN_Z_FRONT_FACTOR  = 0.6
  const OPEN_Z_MIDDLE_FACTOR = 0.3
  const OPEN_Z_LAST_FACTOR   = 0.45

  const openOffsetX       = SPINE_WIDTH * OPEN_X_FACTOR
  const openOffsetZFront  = -SPINE_WIDTH * OPEN_Z_FRONT_FACTOR
  const openOffsetZMiddle = -SPINE_WIDTH * OPEN_Z_MIDDLE_FACTOR
  const openOffsetZLast   = -SPINE_WIDTH * OPEN_Z_LAST_FACTOR

  let openZ
  if (delayedPage < totalPages / 2) {
    openZ = openOffsetZFront
  } else if (delayedPage === totalPages - 1) {
    openZ = openOffsetZLast
  } else {
    openZ = openOffsetZMiddle
  }

  const targetPos = bookClosed
    ? [
        0,
        0,
        delayedPage === totalPages
          ? -PAGE_DEPTH * (totalPages + 0.05)
          : -0.001
      ]
    : [openOffsetX, 0, openZ]

  const targetRot = bookClosed
    ? [0, delayedPage === totalPages ? Math.PI : 0, 0]
    : [0, Math.PI / 2, 0]

  useFrame((_, delta) => {
    if (!bookRef.current) return
    easing.damp3(bookRef.current.position, targetPos, easingFactor, delta)
    easing.dampE(bookRef.current.rotation, targetRot, easingFactor, delta)
  })

  return (
    <group {...props}>
      <group>
        <Cover
          isBackCover={false}
          bookClosed={bookClosed}
          currentPage={delayedPage}
          totalPages={totalPages}
        />
        <SpineFolded
          totalPages={totalPages}
          currentPage={delayedPage}
          bookClosed={bookClosed}
        />
        <group ref={bookRef} >
          {[...pages].slice(1, -1).map((p, i) => (
            <Page
              key={i}
              page={delayedPage}
              number={i + 1}
              opened={delayedPage > i + 1}
              bookClosed={bookClosed}
              {...p}
            />
          ))}
        </group>
        <Cover
          isBackCover={true}
          bookClosed={bookClosed}
          currentPage={delayedPage}
          totalPages={totalPages}
        />
      </group>
    </group>
  )
}