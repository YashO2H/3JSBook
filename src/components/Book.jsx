import { useEffect, useMemo, useRef, useState } from "react"
import { pageAtom, pages } from './UI'
import { Bone, BoxGeometry, Color, Float32BufferAttribute, MathUtils, MeshStandardMaterial, Skeleton, SkeletonHelper, SkinnedMesh, SRGBColorSpace, Uint16BufferAttribute, Vector3 } from "three";
import { useCursor, useTexture } from "@react-three/drei";
import { useAtom } from "jotai";
import { useFrame, useLoader } from "@react-three/fiber";
import { degToRad, radToDeg } from "three/src/math/MathUtils.js";
import { easing } from "maath";
import * as THREE from "three"

// const easingFactor = 0.3; // Control the page of easing
// const easingFactorFold = 0.3
// const insideCurveStrength = 0.18;
// const outsideCurveStrength = 0.05;
// const turningCurveStrength = 0.09;
const easingFactor = 0.5; // Controls the speed of the easing
const easingFactorFold = 0.3; // Controls the speed of the easing
const insideCurveStrength = 0.18; // Controls the strength of the curve
const outsideCurveStrength = 0.05; // Controls the strength of the curve
const turningCurveStrength = 0.09; // Controls the strength of the curve
const PAGE_WIDTH = 1.28;
const PAGE_HEIGHT = 1.71; // 4:3 aspect ratio
const PAGE_DEPTH = 0.003;
const COVER_DEPTH = 0.003; // Cover depth
const PAGE_SEGMENTS = 30; // Divides the page for smoother bending
const SEGMENT_WIDTH = PAGE_WIDTH * 1.05 / PAGE_SEGMENTS;

// Function to create a page geometry with custom depth
const createPageGeometry = (depth = PAGE_DEPTH, isCover) => {
  const width = isCover ? PAGE_WIDTH * 1.05 : PAGE_WIDTH;
  const height = isCover ? PAGE_HEIGHT * 1.05 : PAGE_HEIGHT;
  const pageGeometry = new BoxGeometry(
    width,
    height,   // Height
    depth,          // Thickness (can be custom for covers)
    PAGE_SEGMENTS,  // Horizontal segments for smooth deformation
    2               // Only 2 vertical segments are enough
  );

  pageGeometry.translate(width / 2, 0, 0);

  const position = pageGeometry.attributes.position; // Access the page's vertex positions
  const vertex = new Vector3();  // Temporary vector to hold vertex data
  const skinIndexes = [];       // Tracks which bones affect each vertex
  const skinWeights = [];       // Tracks how strongly each bone affects the vertex


  for (let i = 0; i < position.count; i++) {
    // All VERTICES
    vertex.fromBufferAttribute(position, i); // Get the vertex
    const x = vertex.x; // Get the x position of the vertex

    // Determine which bone controls this vertex
    const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH));

    // Calculate how much influence each bone has (blending effect)
    let skinWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH;

    // Assign two bones to each vertex for smooth bending
    skinIndexes.push(skinIndex, skinIndex + 1, 0, 0);
    skinWeights.push(1 - skinWeight, skinWeight, 0, 0);
  }

  pageGeometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndexes, 4));
  pageGeometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));

  return pageGeometry;
}

// Create regular page and cover page geometries
const pageGeometry = createPageGeometry(PAGE_DEPTH, false);
const coverGeometry = createPageGeometry(COVER_DEPTH, true);

const whiteColor = new Color("white");
const emissiveColor = new Color("orange");
const coverColor = new Color("#e8dbc5"); // Slightly different color for covers

const preloadTextures = () => {
  useTexture.preload(`/textures/spine.jpg`);
  // Preload page textures
  pages.forEach((page) => {
    useTexture.preload(`/textures/${page.front}.jpg`);
    useTexture.preload(`/textures/${page.back}.jpg`);
    useTexture.preload(`/textures/book-cover-roughness.jpg`);
  });
};

const Spine = ({ totalPage, page, delayedPage }) => {
  const SPINE_WIDTH = PAGE_DEPTH * totalPage;
  const SPINE_HEIGHT = PAGE_HEIGHT * 1.05;
  const SPINE_DEPTH = PAGE_DEPTH * 1.05;
  const CURVE_RADIUS = SPINE_WIDTH / Math.PI; // Controls U-shape radius

  const spineRef = useRef();

  // Custom geometry with U-shape curve
  const spineGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(
      SPINE_WIDTH,
      SPINE_HEIGHT,
      SPINE_DEPTH,
      50, // More segments for smoother curvature
      1,
      1
    );

    const position = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);

      // U-shaped curve logic
      const curveAngle = (vertex.x / SPINE_WIDTH) * Math.PI / 2; // Map X position to angle

      vertex.z = -Math.cos(curveAngle) * CURVE_RADIUS + CURVE_RADIUS * 1.4 / 2;
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    position.needsUpdate = true;
    return geometry;
  }, [SPINE_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]);

  const spineTexture = useLoader(THREE.TextureLoader, [`/textures/spine.jpg`]);
  spineTexture[0].colorSpace = THREE.SRGBColorSpace;
  spineTexture[0].wrapS = THREE.ClampToEdgeWrapping;
  spineTexture[0].wrapT = THREE.ClampToEdgeWrapping;
  spineTexture[0].repeat.set(1, 1);
  spineTexture[0].offset.set(0, 0);

  const spineMaterial = new THREE.MeshStandardMaterial({
    map: spineTexture[0],
  });

  useFrame((_, delta) => {
    if (!spineRef.current) return;
    const spineShift = delayedPage * PAGE_DEPTH;
    spineRef.current.position.x = SPINE_WIDTH / 2 - spineShift;
  });

  return (
    <mesh
      ref={spineRef}
      geometry={spineGeometry}
      material={spineMaterial}
      position={[0, 0, 0]}
      rotation={[0, 0, 0]}
    />
  );
};

const Page = ({ key, number, front, back, page, opened, bookClosed, ...props }) => {
  const isCover = number === 0 || number === (pages.length - 1);
  const [picture, picture2, ..._rest] = useTexture([
    `/textures/${front}.jpg`,
    `/textures/${back}.jpg`,
    ...(isCover ? [`/textures/book-cover-roughness.jpg`] : [])
  ])

  picture.colorSpace = picture2.colorSpace = SRGBColorSpace;
  const group = useRef();
  const turnedAt = useRef(0);
  const lastOpened = useRef(opened);

  const skinnedMeshRef = useRef();

  // Six material has our boxes geometry has six phase as one phase has one material
  const pageMaterials = useMemo(() => [
    new MeshStandardMaterial({ color: 'blue' }),
    new MeshStandardMaterial({ color: 'red' }),
    new MeshStandardMaterial({ color: 'green' }),
    new MeshStandardMaterial({ color: 'yellow' }),
  ], []);


  const manualSkinnedMesh = useMemo(() => {
    const bones = [];

    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      let bone = new Bone();
      bones.push(bone);
      if (i === 0) {
        bone.position.x = 0;
      } else {
        bone.position.x = SEGMENT_WIDTH;
      }

      if (i > 0) {
        bones[i - 1].add(bone); // Attach new bone to the previous one
      }
    }

    const skeleton = new Skeleton(bones);
    const selectedGeometry = isCover ? coverGeometry : pageGeometry;

    const materials = [...pageMaterials,
    new MeshStandardMaterial({
      color: isCover ? coverColor : whiteColor,
      map: picture,
      roughness: isCover ? 0.2 : 0.1,
      emissive: emissiveColor,
      emissiveIntensity: 0
    }),
    new MeshStandardMaterial({
      color: isCover ? coverColor : whiteColor,
      map: picture2,
      roughness: isCover ? 0.2 : 0.1,
      emissive: emissiveColor,
      emissiveIntensity: 0
    })
    ];

    const mesh = new SkinnedMesh(selectedGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    return mesh;
  }, []);


  useFrame((_, delta) => {
    if (!skinnedMeshRef.current) {
      return;
    }

    const emissiveIntensity = highlighted ? 0.22 : 0;
    skinnedMeshRef.current.material[4].emissiveIntensity =
      skinnedMeshRef.current.material[5].emissiveIntensity = MathUtils.lerp(
        skinnedMeshRef.current.material[4].emissiveIntensity,
        emissiveIntensity,
        0.1
      );

    if (lastOpened.current !== opened) {
      turnedAt.current = +new Date();
    }
    lastOpened.current = opened;

    let turningTime = Math.min(400, new Date() - turnedAt.current) / 400;
    turningTime = Math.sin(turningTime * Math.PI);

    // Default target rotation for regular pages
    let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2;

    // If the book is not closed, offset around the *middle* page
    if (!bookClosed) {
      // Calculate the middle page index
      const middleIndex = (pages.length - 1) / 2;
      // Shift the page index around that middle
      const offsetFromMiddle = number - middleIndex;

      // Then fan out by offsetFromMiddle * 0.6
      targetRotation += degToRad(offsetFromMiddle * 0.3);
    }

    const bones = skinnedMeshRef.current.skeleton.bones;
    // COMPLETELY DIFFERENT BEHAVIOR FOR COVERS
    if (isCover) {
      // For the front cover (number === 0)
      if (number === 0) {
        // When the book is opened past the front cover
        if (bookClosed) {
          // Ensure front cover fully closes
          group.current.position.x = -page * PAGE_DEPTH; // Correct positioning when closed
          easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta);
        } else {
          easing.dampAngle(group.current.rotation, "y", Math.PI, easingFactor, delta);
          group.current.position.x = 0
        }
        for (let i = 0; i < bones.length; i++) {
          easing.dampAngle(bones[i].rotation, "y", 0, easingFactor, delta);
          easing.dampAngle(bones[i].rotation, "x", 0, easingFactorFold, delta);
        }
      }

      // For the back cover (number === pages.length - 1)
      if (number === pages.length - 1) {
        if (!bookClosed) {
          easing.dampAngle(group.current.rotation, "y", 0, easingFactor, delta);
        } else {
          easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta);
        }
        for (let i = 0; i < bones.length; i++) {
          easing.dampAngle(bones[i].rotation, "y", 0, easingFactor, delta);
          easing.dampAngle(bones[i].rotation, "x", 0, easingFactorFold, delta);
        }
      }

    }
    // REGULAR PAGES - ORIGINAL BEHAVIOR
    else {
      // Regular pages use the original animation logic
      easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta);

      // Handle the individual bone rotations for regular pages
      for (let i = 0; i < bones.length; i++) {
        const target = i === 0 ? group.current : bones[i];
        const insideCurveIntensity = i < 6 ? Math.sin(1) : 0;
        const outsideCurveIntensity =-0.1;
        const turningIntensity = Math.sin(i * Math.PI * (1 / bones.length)) * turningTime;
      
        let rotationAngle = insideCurveStrength * insideCurveIntensity * targetRotation -
          outsideCurveStrength * outsideCurveIntensity * targetRotation +
          turningCurveStrength * turningIntensity * targetRotation;
      
        if (bookClosed) {
          rotationAngle = 0;
        }
      
        easing.dampAngle(bones[i].rotation, "y", rotationAngle, easingFactor, delta);
        
        // Calculate vertical position of this bone segment relative to the page height
        // This is an approximation as we don't have direct height info per bone
        const relativeHeight = i / bones.length;
        
        // Apply X rotation (folding) only to the bottom half of the page
        if (relativeHeight >= 0.5) {
          const foldIntensity = Math.sin(i * Math.PI * (1 / bones.length) - 0.5) * turningTime;
          const foldRotationAngle = degToRad(Math.sign(targetRotation) * 2);
          easing.dampAngle(target.rotation, "x", foldRotationAngle * foldIntensity, easingFactorFold, delta);
        } else {
          // Keep the upper half completely flat
          easing.dampAngle(target.rotation, "x", 0, easingFactorFold, delta);
        }
      }
    }
  });

  const [_, setPage] = useAtom(pageAtom)
  const [highlighted, setHighlighted] = useState(false)
  useCursor(highlighted)

  return (
    <group
      {...props}
      ref={group}
      rotation-y={-Math.PI / 2}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHighlighted(true);
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        setHighlighted(false);
      }}
      // onClick={(e) => {
      //   e.stopPropagation();
      //   setPage(opened ? number : number + 1);
      //   setHighlighted(false)
      // }}
    >
      <primitive
        ref={skinnedMeshRef}
        object={manualSkinnedMesh}
        position-z={
          isCover?((number === 0)
            ? -number * PAGE_DEPTH
            : (number === pages.length - 1)
              ? (bookClosed ?  -number * PAGE_DEPTH + page * PAGE_DEPTH : 0)
              : -number * PAGE_DEPTH + page * PAGE_DEPTH):(-number * PAGE_DEPTH + page * PAGE_DEPTH)
        }
        position-x={(isCover && !bookClosed) && (number === 0 ? (page * PAGE_DEPTH) : ((pages.length - page) * PAGE_DEPTH))}
      />

{/* <primitive
        ref={skinnedMeshRef}
        object={manualSkinnedMesh}
        position-z={
          isCover
            ? (number === 0 ? 0 : -pages.length * PAGE_DEPTH +   number * PAGE_DEPTH) // Keep covers fixed
            : (number === 0)
              ? -number * PAGE_DEPTH
              : (number === pages.length - 1)
                ? (!bookClosed ? 0 : -number * PAGE_DEPTH + page * PAGE_DEPTH)
                : -number * PAGE_DEPTH + page * PAGE_DEPTH
        }
        // position-x={
        //   isCover
        //     ? (number === 0 ? 0 : -pages.length * PAGE_DEPTH ) // Keep covers fixed
        //     : (number === 0 ? (page * PAGE_DEPTH) : ((pages.length - page) * PAGE_DEPTH))
        // }
        position-x={isCover  && (number === 0 ? (page * PAGE_DEPTH) : (pages.length * PAGE_DEPTH ))}
      /> */}
    </group>
  )
}
export const Book = ({ ...props }) => {
  const [page] = useAtom(pageAtom)
  const [delayedPage, setDelayedPage] = useState(page);

  useEffect(() => {
    try {
      preloadTextures();
    } catch (error) {
      console.error("Error preloading textures:", error);
    }
  }, []);

  useEffect(() => {
    let timeout;
    const goToPage = () => {
      setDelayedPage((delayedPage) => {
        if (page === delayedPage) {
          return delayedPage;
        } else {
          timeout = setTimeout(() => {
            goToPage();
          }, Math.abs(page - delayedPage) > 2 ? 50 : 150)

          if (page > delayedPage) {
            return delayedPage + 1;
          }
          if (page < delayedPage) {
            return delayedPage - 1;
          }
        }
      })
    }

    goToPage();
    return () => {
      clearTimeout(timeout)
    };
  }, [page])

  return (
    <group {...props} rotation-y={Math.PI / 2}>
      <Spine totalPage={pages.length} page={page} delayedPage={delayedPage} />
      {[...pages].map((pageData, index) => (
        <Page
          key={index}
          page={delayedPage}
          number={index}
          opened={delayedPage > index}
          bookClosed={delayedPage === 0 || delayedPage === pages.length}
          {...pageData}
        />
      ))}
    </group>
  );
}