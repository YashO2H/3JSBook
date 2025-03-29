import { useEffect, useMemo, useRef, useState } from "react"
import { pageAtom, pages } from './UI'
import { Bone, BoxGeometry, Color, Float32BufferAttribute, MathUtils, Mesh, MeshStandardMaterial, Skeleton, SkeletonHelper, SkinnedMesh, SRGBColorSpace, TextureLoader, Uint16BufferAttribute, Vector3 } from "three";
import * as THREE from "three";
import { useCursor, useTexture } from "@react-three/drei";
import { useAtom } from "jotai";
import { useFrame, useLoader } from "@react-three/fiber";
import { degToRad } from "three/src/math/MathUtils.js";
import { easing } from "maath";

const easingFactor = 0.5; //Control the page of easing
const easingFactorFold = 0.3
const insideCurveStrength = 0.18;
const outsideCurveStrength = 0.05;
const turningCurveStrength = 0.09;
const PAGE_WIDTH = 1.28;
const PAGE_HEIGHT = 1.71; //4:3 aspect ratio
const PAGE_DEPTH = 0.003;
const COVER_DEPTH = 0.009; 
const PAGE_SEGMENTS = 30; // Divides the page for smoother bending
const SEGMENT_WIDTH = PAGE_WIDTH / PAGE_SEGMENTS;
const PAGE_TURN_DURATION = 1.0; // Animation duration in seconds

// Create the geometry outside the component since it doesn't depend on props or state
const createPageGeometry = (depth = PAGE_DEPTH, isCover) => {
  const width = isCover ? PAGE_WIDTH * 1.05 : PAGE_WIDTH;
  const height = isCover ? PAGE_HEIGHT * 1.05 :PAGE_HEIGHT;
  const geometry = new BoxGeometry(
    width,
    height,   // Height
    depth,    // Thickness
    PAGE_SEGMENTS,  // Horizontal segments for smooth deformation
    2               // Only 2 vertical segments are enough
  );

  geometry.translate(width / 2, 0, 0);

  const uvs = geometry.attributes.uv.array;

  // Corrected Left Face (Spine) - Indices 16-23
  for (let i = 16; i < 24; i += 2) {
    uvs[i] = uvs[i] * 1;      // Map full width
    uvs[i + 1] = uvs[i + 1] * (PAGE_HEIGHT / PAGE_WIDTH);  // Scale for aspect ratio
  }

  geometry.attributes.uv.needsUpdate = true;


  const position = geometry.attributes.position; // Access the page's vertex positions
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

  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(skinIndexes, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(skinWeights, 4));

  return geometry;
};

const pageGeometry = createPageGeometry(PAGE_DEPTH, false);
const coverGeometry = createPageGeometry(PAGE_DEPTH, false);
const whiteColor = new Color("white");
const emissiveColor = new Color("orange");

// Preload textures function (to be called within a component)
const preloadTextures = () => {

  // Preload page textures
  pages.forEach((page) => {
    useTexture.preload(`/textures/${page.front}.jpg`);
    useTexture.preload(`/textures/${page.back}.jpg`);
    useTexture.preload(`/textures/book-cover-roughness.jpg`);
  });
};

// Add the spine geometry to your book group
const Spine = ({totalPage, page}) => {
  // Spine Geometry Dimensions (Custom size for better control)
  const SPINE_WIDTH = 0.003 * (totalPage - page); // Slightly thicker for a realistic look
  const SPINE_HEIGHT = PAGE_HEIGHT;
  const SPINE_DEPTH = PAGE_DEPTH;

  // Separate Spine Geometry
  const spineGeometry = new BoxGeometry(
    SPINE_WIDTH,     // Width of the spine
    SPINE_HEIGHT,    // Height (matches page height)
    SPINE_DEPTH      // Thickness (matches page depth)
  );

  // Spine Texture Handling
  const spineTexture = useLoader(TextureLoader, [`/textures/DSC02069.jpg`]);
  spineTexture[0].colorSpace = SRGBColorSpace;
  spineTexture[0].wrapS = THREE.ClampToEdgeWrapping;
  spineTexture[0].wrapT = THREE.ClampToEdgeWrapping;
  spineTexture[0].repeat.set(1, 1);  // Stretch to full width & height
  spineTexture[0].offset.set(0, 0);  // Center the texture

  const spineMaterial = new MeshStandardMaterial({
    map: spineTexture[0]
  });
  return <mesh geometry={spineGeometry} material={spineMaterial} position={[0, 0, -(totalPage- page) * PAGE_DEPTH / 2]} rotation={[0, Math.PI/2, 0]}/>
}


const Page = ({ number, front, back, page, opened, bookClosed, ...props }) => {
  const iscover = number === 0 || number === pages.length - 1;
  // Load textures inside the component
  const [picture, picture2, ...[pictureRoughness]] = useTexture([
    `/textures/${front}.jpg`,
    `/textures/${back}.jpg`,
    ...(number === 0 || number === pages.length - 1 ? [`/textures/book-cover-roughness.jpg`] : [])
  ]);

  picture.colorSpace = picture2.colorSpace = SRGBColorSpace;

  // Get the spine texture inside the component
  // const spineTexture = useTexture(`/textures/Red.jpg`, undefined, (error) => {
  //   console.error("Spine texture error:", error);
  // });

  // const spineTexture = useLoader(TextureLoader, [`/textures/spine.jpg`]);
  // spineTexture[0].colorSpace = SRGBColorSpace;
  // spineTexture[0].wrapS = THREE.ClampToEdgeWrapping;
  // spineTexture[0].wrapT = THREE.ClampToEdgeWrapping;

  // // Scale the image to fit exactly within the spine area
  // spineTexture[0].repeat.set(1, 1);  // Stretch to full width & height
  // spineTexture[0].offset.set(0, 0);  // Center the texture


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

    const selectedGeometry = (iscover) ? coverGeometry : pageGeometry;
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
    <group {...props} ref={group} rotation-y={opened ? -Math.PI : 0}
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
  const [page] = useAtom(pageAtom);
  const [delayedPage, setDelayedPage] = useState(page);

  // Call preload textures inside the component
  useEffect(() => {
    try {
      preloadTextures();
    } catch (error) {
      ;
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
    <group {...props}>
      <group>
        <Spine totalPage={pages.length} page={delayedPage}/>
        <Spine totalPage={page} page={page - delayedPage}/>
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
    </group>
  )
}