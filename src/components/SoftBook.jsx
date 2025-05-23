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
import { getPages, pageAtom } from "./UI";
import * as THREE from "three" 
import { svgStringToPngBlobUrl } from "./HelperFunction";

const easingFactor = 0.5; // Controls the speed of the easing
const easingFactorFold = 0.3; // Controls the speed of the easing
const insideCurveStrength = 0.18; // Controls the strength of the curve
const outsideCurveStrength = 0.05; // Controls the strength of the curve
const turningCurveStrength = 0.09; // Controls the strength of the curve

const PAGE_DEPTH = 0.001;
const PAGE_SEGMENTS = 30;

const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

const createPageGeometry = (depth = PAGE_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, isCover) => {
    const width = isCover ? COVER_WIDTH  : PAGE_WIDTH;
    const height = isCover ? COVER_HEIGTH  : PAGE_HEIGHT;
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


const Spine = ({totalPage, page, bookClosed,PAGE_DEPTH,COVER_HEIGTH,COVER_DEPTH}) => {
  // Spine Geometry Dimensions (Custom size for better control)
  const SPINE_WIDTH = PAGE_DEPTH * (totalPage); // Slightly thicker for a realistic look
  const SPINE_HEIGHT = COVER_HEIGTH;
  const SPINE_DEPTH = PAGE_DEPTH;
  const spineRef = useRef();

  // Separate Spine Geometry
  const spineGeometry = new BoxGeometry(
    SPINE_WIDTH,     // Width of the spine
    SPINE_HEIGHT,    // Height (matches page height)
    SPINE_DEPTH      // Thickness (matches page depth)
  );

  // Spine Texture Handling
  // const spineTexture = useLoader(TextureLoader, [`/textures/DSC02069.jpg`]);
  // spineTexture[0].colorSpace = THREE.SRGBColorSpace;
  // spineTexture[0].wrapS = THREE.ClampToEdgeWrapping;
  // spineTexture[0].wrapT = THREE.ClampToEdgeWrapping;
  // spineTexture[0].repeat.set(1, 1);  // Stretch to full width & height
  // spineTexture[0].offset.set(0, 0);  // Center the texture

  const spineMaterial = new MeshStandardMaterial({
    color: 'red'
  });

  useFrame((_, delta) => {
    if(bookClosed){
      easing.damp3(spineRef.current.position, new THREE.Vector3(-SPINE_WIDTH/2+0.001 , 0, 0), easingFactor, delta)
      easing.dampE(
        spineRef.current.rotation,
        new THREE.Euler(0, page == totalPage ? Math.PI:0, 0),
        easingFactor,
        delta
    )
    }else{
      spineRef.current.position.z = -(totalPage/2) * PAGE_DEPTH + page * PAGE_DEPTH
      spineRef.current.position.x = -0.001
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

const Page = ({ number, page, opened, bookClosed, totalPages, pageImages, pageGeometry, coverGeometry, SEGMENT_WIDTH }) => {
  const isCover = number ===  0 || number === totalPages - 1
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
  picture.colorSpace = picture2.colorSpace = THREE.SRGBColorSpace;
  const group = useRef();
  const turnedAt = useRef(0);
  const lastOpened = useRef(opened);

  const skinnedMeshRef = useRef();

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
        map: picture,
      }),
      new MeshStandardMaterial({
        map: picture2,
      }),
    ];
    const mesh = new SkinnedMesh(isCover? coverGeometry:pageGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    return mesh;
  }, [picture, picture2]);


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
      const middleIndex = totalPages / 2;
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


  if (!picture) return null;

  return (
    <group
      ref={group}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHighlighted(true);
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
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

export const SoftBook = ({ pageImages = [],
  pageWidth,
  pageHeight,
  pageDepth,
  coverHeight,
  coverWidth,
  nextPage }) => {
  const [page] = useAtom(pageAtom)
    const [delayedPage, setDelayedPage] = useState(page)
    const spine = pageImages[pageImages.length - 1]; 
    const pages = getPages(pageImages.slice(0, -1)); 
    const totalPages = pages?.length || 0
    const PAGE_WIDTH = pageWidth
    const PAGE_HEIGHT = pageHeight
    const COVER_WIDTH = coverWidth
    const COVER_HEIGTH = coverHeight
    const COVER_DEPTH = 0.001
    const SEGMENT_WIDTH = COVER_WIDTH / PAGE_SEGMENTS
    const [_, setPage] = useAtom(pageAtom);

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

  // Create geometries
  const pageGeometry = createPageGeometry(PAGE_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, false)
  const coverGeometry = createPageGeometry(COVER_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, true)
  const bookClosed = delayedPage === 0 || delayedPage === totalPages

  return (
    <group rotation-y={-Math.PI / 2}>
      <Spine totalPage={totalPages} page={delayedPage} bookClosed={page === 0 || page === pages.length} COVER_DEPTH={COVER_DEPTH} PAGE_DEPTH={PAGE_DEPTH} COVER_HEIGTH={COVER_HEIGTH}/>
      {pages.map((pageData, index) => (
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
          {...pageData}
        />
      ))}
    </group>
  );
};