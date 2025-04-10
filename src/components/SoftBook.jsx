import { useCursor, useTexture } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { useAtom } from "jotai";
import { easing } from "maath";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bone,
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  TextureLoader,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { degToRad } from "three/src/math/MathUtils.js";
import { pageAtom, pages } from "./UI";
import * as THREE from "three" 

const easingFactor = 0.5; // Controls the speed of the easing
const easingFactorFold = 0.3; // Controls the speed of the easing
const insideCurveStrength = 0.18; // Controls the strength of the curve
const outsideCurveStrength = 0.05; // Controls the strength of the curve
const turningCurveStrength = 0.09; // Controls the strength of the curve

const PAGE_WIDTH = 1.28;
const PAGE_HEIGHT = 1.71; // 4:3 aspect ratio
const PAGE_DEPTH = 0.003;
const COVER_DEPTH = 0.009;
const PAGE_SEGMENTS = 30;
const RATIO = 1.05;
const SEGMENT_WIDTH = PAGE_WIDTH / PAGE_SEGMENTS;

const createPageGeometry = (depth = PAGE_DEPTH, isCover) => {
    const width = isCover ? PAGE_WIDTH / RATIO   : PAGE_WIDTH;
    const height = isCover ? PAGE_HEIGHT / RATIO  : PAGE_HEIGHT;
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
      // ALL VERTICES
      vertex.fromBufferAttribute(position, i); // get the vertex
      const x = vertex.x; // get the x position of the vertex
    
      const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH)); // calculate the skin index
      let skinWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH; // calculate the skin weight
    
      skinIndexes.push(skinIndex, skinIndex + 1, 0, 0); // set the skin indexes
      skinWeights.push(1 - skinWeight, skinWeight, 0, 0); // set the skin weights
    }
    
    pageGeometry.setAttribute(
      "skinIndex",
      new Uint16BufferAttribute(skinIndexes, 4)
    );
    pageGeometry.setAttribute(
      "skinWeight",
      new Float32BufferAttribute(skinWeights, 4))

    return pageGeometry;
}

// Create geometries
const pageGeometry = createPageGeometry(PAGE_DEPTH, false);
const coverGeometry = createPageGeometry(COVER_DEPTH, true);

const whiteColor = new Color("white");
const emissiveColor = new Color("orange");

const pageMaterials = [
  new MeshStandardMaterial({
    color: whiteColor,
  }),
  new MeshStandardMaterial({
    color: "#111",
  }),
  new MeshStandardMaterial({
    color: whiteColor,
  }),
  new MeshStandardMaterial({
    color: whiteColor,
  }),
];

pages.forEach((page) => {
  useTexture.preload(`/textures/${page.front}.jpg`);
  useTexture.preload(`/textures/${page.back}.jpg`);
  useTexture.preload(`/textures/book-cover-roughness.png`);
});

const Spine = ({totalPage, page, bookClosed}) => {
  console.log(bookClosed, 'lkasfdlkadsfjlkfdsaljk')
  // Spine Geometry Dimensions (Custom size for better control)
  const SPINE_WIDTH = PAGE_DEPTH * (totalPage - 2) + COVER_DEPTH; // Slightly thicker for a realistic look
  const SPINE_HEIGHT = PAGE_HEIGHT / RATIO;
  const SPINE_DEPTH = PAGE_DEPTH;
  const spineRef = useRef();

  // Separate Spine Geometry
  const spineGeometry = new BoxGeometry(
    SPINE_WIDTH,     // Width of the spine
    SPINE_HEIGHT,    // Height (matches page height)
    SPINE_DEPTH      // Thickness (matches page depth)
  );

  // Spine Texture Handling
  const spineTexture = useLoader(TextureLoader, [`/textures/DSC02069.jpg`]);
  spineTexture[0].colorSpace = THREE.SRGBColorSpace;
  spineTexture[0].wrapS = THREE.ClampToEdgeWrapping;
  spineTexture[0].wrapT = THREE.ClampToEdgeWrapping;
  spineTexture[0].repeat.set(1, 1);  // Stretch to full width & height
  spineTexture[0].offset.set(0, 0);  // Center the texture

  const spineMaterial = new MeshStandardMaterial({
    map: spineTexture[0]
  });

  useFrame((_, delta) => {
    if(bookClosed){
      easing.damp3(spineRef.current.position, new THREE.Vector3(-SPINE_WIDTH/2 , 0, 0), easingFactor, delta)
      easing.dampE(
        spineRef.current.rotation,
        new THREE.Euler(0, page == pages.length ? Math.PI:0, 0),
        easingFactor,
        delta
    )
    }else{
      spineRef.current.position.z = -(totalPage/2) * PAGE_DEPTH + page * PAGE_DEPTH
      spineRef.current.position.x = -0.005
        easing.dampE(
        spineRef.current.rotation,
        new THREE.Euler(0, -Math.PI / 2, 0),
        easingFactor,
        delta
    )
    }

  })

  return <mesh ref= {spineRef} geometry={spineGeometry} material={spineMaterial} />
}

const Page = ({ number, front, back, page, opened, bookClosed, ...props }) => {
  const isCover = number ===  0 || number === pages.length - 1
  const [picture, picture2, pictureRoughness] = useTexture([
    `/textures/${front}.jpg`,
    `/textures/${back}.jpg`,
    ...(number === 0 || number === pages.length - 1
      ? [`/textures/book-cover-roughness.png`]
      : []),
  ]);
  picture.colorSpace = picture2.colorSpace = THREE.SRGBColorSpace;
  const group = useRef();
  const turnedAt = useRef(0);
  const lastOpened = useRef(opened);

  const skinnedMeshRef = useRef();

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
        bones[i - 1].add(bone); // attach the new bone to the previous bone
      }
    }
    const skeleton = new Skeleton(bones);

    const materials = [
      ...pageMaterials,
      new MeshStandardMaterial({
        color: whiteColor,
        map: picture,
        ...(number === 0
          ? {
              roughnessMap: pictureRoughness,
            }
          : {
              roughness: 0.1,
            }),
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
      new MeshStandardMaterial({
        color: whiteColor,
        map: picture2,
        ...(number === pages.length - 1
          ? {
              roughnessMap: pictureRoughness,
            }
          : {
              roughness: 0.1,
            }),
        emissive: emissiveColor,
        emissiveIntensity: 0,
      }),
    ];
    const mesh = new SkinnedMesh(isCover? coverGeometry:pageGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    return mesh;
  }, []);

  // useHelper(skinnedMeshRef, SkeletonHelper, "red");

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
      lastOpened.current = opened;
    }
    let turningTime = Math.min(400, new Date() - turnedAt.current) / 400;
    turningTime = Math.sin(turningTime * Math.PI);

    let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2;
    if (!bookClosed) {
      const middleIndex = (pages.length - 1) / 2;
      const offsetFromMiddle = number - middleIndex;
      targetRotation += degToRad(offsetFromMiddle * 0.6);
  }

    const bones = skinnedMeshRef.current.skeleton.bones;
    for (let i = 0; i < bones.length; i++) {
      const target = i === 0 ? group.current : bones[i];

      const insideCurveIntensity = i < 8 ? Math.sin(i * 0.2 + 0.25) : 0;
      const outsideCurveIntensity = i >= 8 ? Math.cos(i * 0.3 + 0.09) : 0;
      const turningIntensity =
        Math.sin(i * Math.PI * (1 / bones.length)) * turningTime;
      let rotationAngle =
        insideCurveStrength * insideCurveIntensity * targetRotation -
        outsideCurveStrength * outsideCurveIntensity * targetRotation +
        turningCurveStrength * turningIntensity * targetRotation;
      let foldRotationAngle = degToRad(Math.sign(targetRotation) * 2);
      if (bookClosed) {
        if (i === 0) {
          rotationAngle = targetRotation;
          foldRotationAngle = 0;
        } else {
          rotationAngle = 0;
          foldRotationAngle = 0;
        }
      }
      easing.dampAngle(
        target.rotation,
        "y",
        rotationAngle,
        easingFactor,
        delta
      );

      const foldIntensity =
        i > 8
          ? Math.sin(i * Math.PI * (1 / bones.length) - 0.5) * turningTime
          : 0;
      easing.dampAngle(
        target.rotation,
        "x",
        foldRotationAngle * foldIntensity,
        easingFactorFold,
        delta
      );
    }
  });

  const [_, setPage] = useAtom(pageAtom);
  const [highlighted, setHighlighted] = useState(false);
  useCursor(highlighted);

  return (
    <group
      {...props}
      ref={group}
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
        object={manualSkinnedMesh}
        ref={skinnedMeshRef}
        position-z={-number * PAGE_DEPTH + page * PAGE_DEPTH}
      />
    </group>
  );
};

export const SoftBook = ({ ...props }) => {
  const [page] = useAtom(pageAtom);
  const [delayedPage, setDelayedPage] = useState(page);

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

  return (
    <group {...props} rotation-y={-Math.PI / 2}>
      <Spine totalPage={pages.length} page={delayedPage} bookClosed={page === 0 || page === pages.length}/>
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
};