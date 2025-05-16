import { useEffect, useMemo, useRef, useState } from "react"
import { getPages, pageAtom } from './UI'
import { Bone, BoxGeometry, Color, Float32BufferAttribute, MathUtils, Mesh, MeshStandardMaterial, Skeleton, SkeletonHelper, SkinnedMesh, SRGBColorSpace, TextureLoader, Uint16BufferAttribute, Vector3 } from "three";
import * as THREE from "three";
import { useCursor, useTexture } from "@react-three/drei";
import { useAtom } from "jotai";
import { useFrame, useLoader } from "@react-three/fiber";
import { degToRad } from "three/src/math/MathUtils.js";
import { easing } from "maath";
import { svgStringToPngBlobUrl } from "./HelperFunction";

const easingFactor = 0.05; //Control the page of easing
const PAGE_TURN_DURATION = 1.0; // Animation duration in seconds
// Book dimensions
const PAGE_SEGMENTS = 30;
const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

// Create the geometry outside the component since it doesn't depend on props or state
const createPageGeometry = (depth , PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, isCover) => {
  const width = isCover ? COVER_WIDTH : PAGE_WIDTH;
  const height = isCover ? COVER_HEIGTH : PAGE_HEIGHT;
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

const whiteColor = new Color("white");
const emissiveColor = new Color("orange");
const coverColor = new Color("#e8dbc5");

// Spine component as a separate mesh
const SpineFolded = ({ totalPages, COVER_HEIGTH, COVER_DEPTH, PAGE_DEPTH,SPINE_WIDTH, currentPage, bookClosed, children }) => {
  const spineMainRef = useRef();
  const spineLeftFoldRef = useRef();
  const spineRightFoldRef = useRef();
  const spineGroupRef = useRef();

  const SPINE_HEIGHT = COVER_HEIGTH;
  const SPINE_DEPTH = COVER_DEPTH;                  // visible spine thickness
  const FOLD_WIDTH = SPINE_WIDTH * 0.15;
  const MAIN_WIDTH = SPINE_WIDTH - 2 * FOLD_WIDTH;

  // // load texture
  // const spineTexture = useLoader(TextureLoader, `/textures/spine.jpg`);
  // spineTexture.colorSpace = SRGBColorSpace;
  // spineTexture.wrapS = THREE.ClampToEdgeWrapping;
  // spineTexture.wrapT = THREE.ClampToEdgeWrapping;


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
      (currentPage === 0 || currentPage === totalPages) || currentPage === 1 || currentPage === totalPages - 1 ? 0 : (-0.001),
      0,
      -SPINE_WIDTH / 2
    );

    // main rotation
    const mainRot = (currentPage === 0 || currentPage === totalPages)
      ? new THREE.Euler(0, Math.PI / 2, 0)
      : new THREE.Euler(0, 0, 0);

    // apply folds
    if (!(currentPage === 0 || currentPage === totalPages)) {
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
    const isClosed = currentPage === 0 || currentPage === totalPages;
    const fullRot = isClosed ? 0 : -Math.PI * (currentPage / totalPages);
    const targetGroupEuler = new THREE.Euler(0, fullRot, 0);
    easing.dampE(
      spineGroupRef.current.rotation,
      targetGroupEuler,
      easingFactor,
      delta
    );
  });

  return (
    <group ref={spineGroupRef} >

      {/* visible cover‑thick spine */}
      <mesh ref={spineMainRef} castShadow receiveShadow>
        <boxGeometry args={[MAIN_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]} />
        <meshStandardMaterial
          // map={spineTexture} 
          roughness={0.3} color={coverColor} />
        {/* left fold */}
        <group ref={spineLeftFoldRef} position={[-MAIN_WIDTH / 2, 0, 0]}>
          <mesh position={[-FOLD_WIDTH / 2, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[FOLD_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]} />
            <meshStandardMaterial roughness={0.3} color={coverColor} />
          </mesh>
        </group>
        {/* right fold */}
        <group ref={spineRightFoldRef} position={[MAIN_WIDTH / 2, 0, 0]}>
          <mesh position={[FOLD_WIDTH / 2, 0, 0]} castShadow receiveShadow>
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
const Cover = ({ isBackCover, bookClosed, frontCover, backCover, frontCoverInner, backCoverInner, currentPage, SEGMENT_WIDTH, COVER_WIDTH, PAGE_DEPTH, SPINE_WIDTH,coverGeometry, totalPages }) => {
  const coverRef = useRef();
  const pivotRef = useRef();
  const spineConnectionRef = useRef(); // Reference for spine connection point
  const [hovered, setHovered] = useState(false);
  const [, setPage] = useAtom(pageAtom);


  const [frontUrl, setFrontUrl] = useState(null);
  const [frontInnerUrl, setFrontInnerUrl] = useState(null);
  const [backUrl, setBackUrl] = useState(null);
  const [backInnerUrl, setBackInnerUrl] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const frontUrl = await svgStringToPngBlobUrl(frontCover, 512, 512);
      const frontInnerUrl = await svgStringToPngBlobUrl(frontCoverInner, 512, 512);
      const backUrl = await svgStringToPngBlobUrl(backCover, 512, 512);
      const backInnerUrl = await svgStringToPngBlobUrl(backCoverInner, 512, 512);
      setFrontUrl(frontUrl);
      setFrontInnerUrl(frontInnerUrl);
      setBackUrl(backUrl)
      setBackInnerUrl(backInnerUrl)
      setReady(true);
    })();
  }, []);

  const front = useTexture(ready ? frontUrl : TRANSPARENT_PX);
  const frontInner = useTexture(ready ? frontInnerUrl : TRANSPARENT_PX);
  const back = useTexture(ready ? backUrl : TRANSPARENT_PX);
  const backInner = useTexture(ready ? backInnerUrl : TRANSPARENT_PX);
  front.colorSpace = back.colorSpace = frontInner.colorSpace = backInner.colorSpace = SRGBColorSpace

  // Create cover material
  const coverMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: !isBackCover ? back : front,
      }),
    [front, frontInner, back, backInner]
  )

  const innerMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: !isBackCover ? backInner : frontInner
      }),
    [front, frontInner, back, backInner]
  )

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
  const FOLD_WIDTH = SPINE_WIDTH * 0.15; // Match with SpineFolded component

  useFrame((_, delta) => {
    if (!coverRef.current || !pivotRef.current) return;

    // Normalized progress
    const normalizedProgress = currentPage / (totalPages);

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

      if (currentPage <= Math.floor((totalPages) / 2)) {
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

    // // Set the spine connection point position for better connection
    // if (spineConnectionRef.current) {
    //   const edgePosition = isBackCover ? -COVER_WIDTH: COVER_WIDTH;
    //   spineConnectionRef.current.position.x = edgePosition;
    // }

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
    <group ref={coverRef}>
      <group ref={pivotRef}>
        <primitive
          object={coverMesh}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onClick={(e) => {
            e.stopPropagation();
            setHovered(false);
          }}
        />
        {/* Spine connection point */}
        <group
          ref={spineConnectionRef}
          position={[isBackCover ? -COVER_WIDTH : COVER_WIDTH, 0, 0]}
        />
      </group>
    </group>
  );
};

const Page = ({
  number,
  front,
  back,
  page,
  opened,
  bookClosed,
  totalPages,
  pageImages,
  pageGeometry,
  coverGeometry,
  SEGMENT_WIDTH,
  SPINE_WIDTH,
  PAGE_DEPTH,
  visible
}) => {
  if (!visible) return null;
  const isCover = number === 0 || number === totalPages - 1;
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
  const picture2 = useTexture(ready ? pngUrl1 : TRANSPARENT_PX);
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
      })
    ];

    const selectedGeometry = pageGeometry;
    const mesh = new Mesh(selectedGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    return mesh;
  }, [picture, picture2]);

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
    <group ref={group}
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

export const RigidBook = ({ pageImages = [],         // ← destructured here
  pageWidth,
  pageHeight,
  pageDepth,
  coverHeight,
  coverWidth,
  coverDepth,
  spineWidth,
  nextPage }) => {
    DnBConsole.log(spineWidth, pageDepth, coverDepth, "Su che bhai aa")
  const [page] = useAtom(pageAtom)
  const [delayedPage, setDelayedPage] = useState(page)
  const spine = pageImages[pageImages.length - 1];
  const frontCover = pageImages[0]
  const frontCoverInner = pageImages[1]
  const backCover = pageImages[pageImages.length - 2]
  const backCoverInner = pageImages[pageImages.length - 3]
  const pages = getPages(pageImages.slice(2, -3), true);
  const totalPages = pages?.length || 0
  const PAGE_WIDTH = pageWidth
  const PAGE_HEIGHT = pageHeight
  const COVER_WIDTH = coverWidth
  const COVER_HEIGTH = coverHeight
  const SEGMENT_WIDTH = COVER_WIDTH / PAGE_SEGMENTS
  const [_, setPage] = useAtom(pageAtom);
  const bookRef = useRef()
  const PAGE_DEPTH = pageDepth
  const COVER_DEPTH = coverDepth

  useEffect(() => {
    setPage(nextPage);
  }, [nextPage, setPage]);

  useEffect(() => {
    let timeout;
    const goToPage = () => {
      setDelayedPage((delayedPage) => {
        if (page === delayedPage) {
          return delayedPage;
        } else {
          timeout = setTimeout(
            () => {
              goToPage();
            },
            Math.abs(page - delayedPage) > 2 ? 50 : 150
          );
          if (page > delayedPage) {
            return delayedPage + 1;
          }
          if (page < delayedPage) {
            return delayedPage - 1;
          }
        }
      });
    };
    goToPage();
    return () => {
      clearTimeout(timeout);
    };
  }, [page]);

  // Determine if book is closed
  const bookClosed = page === 0 || page === totalPages;

  // Create geometries
  const pageGeometry = createPageGeometry(PAGE_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, false);
  const coverGeometry = createPageGeometry(COVER_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, true);

  //
  // ——— DYNAMIC OPEN‑BOOK OFFSETS ———
  //
  const SPINE_WIDTH = spineWidth

  // these factors control how “wide” and “deep” the open book is
  const OPEN_X_FACTOR = 0.52
  const OPEN_Z_FRONT_FACTOR = 0.62
  const OPEN_Z_MIDDLE_FACTOR = 0.3
  const OPEN_Z_LAST_FACTOR = 0.45

  const openOffsetX = SPINE_WIDTH * OPEN_X_FACTOR
  const openOffsetZFront = -SPINE_WIDTH * OPEN_Z_FRONT_FACTOR
  const openOffsetZMiddle = -SPINE_WIDTH * OPEN_Z_MIDDLE_FACTOR
  const openOffsetZLast = -SPINE_WIDTH * OPEN_Z_LAST_FACTOR

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
    <group >
      <group>
        <Cover
          isBackCover={false}
          bookClosed={bookClosed}
          currentPage={nextPage}
          totalPages={totalPages}
          frontCover={frontCover}
          frontCoverInner={frontCoverInner}
          backCover={backCover}
          backCoverInner={backCoverInner}
          SEGMENT_WIDTH={SEGMENT_WIDTH}
          coverGeometry={coverGeometry}
          COVER_WIDTH={COVER_WIDTH}
          SPINE_WIDTH={spineWidth}
          PAGE_DEPTH={PAGE_DEPTH}
        />
        <SpineFolded
          totalPages={totalPages}
          currentPage={delayedPage}
          bookClosed={bookClosed}
          COVER_DEPTH={COVER_DEPTH}
          PAGE_DEPTH={PAGE_DEPTH}
          COVER_HEIGTH={COVER_HEIGTH}
          PAGE_WIDTH={PAGE_WIDTH}
          SPINE_WIDTH={spineWidth}
        />
        <group ref={bookRef}>
          {pages.map((pageData, index) => {
            // Determine visibility for the first and last pages
            const isVisible = !(index === 0 || index === pages.length - 1);

            return (
              <Page
                key={index}
                page={delayedPage}
                number={index}
                opened={delayedPage > index}
                bookClosed={bookClosed}
                totalPages={totalPages}
                pageGeometry={pageGeometry}
                coverGeometry={coverGeometry}
                pageImages={pageData}
                SEGMENT_WIDTH={SEGMENT_WIDTH}
                SPINE_WIDTH={spineWidth}
                PAGE_DEPTH={PAGE_DEPTH}
                visible={isVisible} // Pass visibility here
                {...pageData}
              />
            );
          })}
        </group>
        <Cover
          isBackCover={true}
          bookClosed={bookClosed}
          currentPage={nextPage}
          totalPages={totalPages}
          frontCover={frontCover}
          frontCoverInner={frontCoverInner}
          backCover={backCover}
          backCoverInner={backCoverInner}
          SEGMENT_WIDTH={SEGMENT_WIDTH}
          coverGeometry={coverGeometry}
          SPINE_WIDTH={spineWidth}
          PAGE_DEPTH={PAGE_DEPTH}
          COVER_WIDTH={COVER_WIDTH}
        />
      </group>
    </group>
  )
}