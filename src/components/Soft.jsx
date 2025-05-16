import { useCursor, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
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
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import { degToRad } from "three/src/math/MathUtils.js";
import { getPages, pageAtom, pages } from "./UI";
import { svgStringToPngBlobUrl } from "./HelperFunction";
import * as THREE from "three" 

const easingFactor = 0.5; // Controls the speed of the easing
const easingFactorFold = 0.3; // Controls the speed of the easing
const insideCurveStrength = 0.18; // Controls the strength of the curve
const outsideCurveStrength = 0.05; // Controls the strength of the curve
const turningCurveStrength = 0.09; // Controls the strength of the curve

const PAGE_SEGMENTS = 30;

const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

const createPageGeometry = (PAGE_DEPTH,COVER_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, isCover) => {
    const width = isCover ? COVER_WIDTH  : PAGE_WIDTH;
    const height = isCover ? COVER_HEIGTH  : PAGE_HEIGHT;
    const pageGeometry = new BoxGeometry(
      width,
      height,
      isCover?COVER_DEPTH: PAGE_DEPTH,
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

const whiteColor = new Color("white");
const emissiveColor = new Color("orange");


const Page = ({ number, page, opened, bookClosed, totalPages, pageImages, pageGeometry, coverGeometry,SPINE_WIDTH,PAGE_DEPTH, SEGMENT_WIDTH, ...props }) => {
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
      targetRotation += degToRad(number * 0.8);
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

export const Soft = ({pageImages = [],
    pageWidth,
    pageHeight,
    coverHeight,
    coverWidth,
    pageDepth,
    coverDepth,
    spineWidth,
    nextPage,
    ...props }) => {
  const [page] = useAtom(pageAtom)
    const [delayedPage, setDelayedPage] = useState(page)
    const spine = pageImages[pageImages.length - 1]; 
    const pages = getPages(pageImages.slice(0, -1)); 
    DnBConsole.log(pages, "what are the pages")
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
const pageGeometry = createPageGeometry(PAGE_DEPTH, COVER_DEPTH,PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, false)
const coverGeometry = createPageGeometry(PAGE_DEPTH,COVER_DEPTH, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, true)
const bookClosed = delayedPage === 0 || delayedPage === totalPages

  return (
    <group {...props} rotation-y={-Math.PI / 2}>
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
            SPINE_WIDTH={spineWidth}
            PAGE_DEPTH={PAGE_DEPTH}
            {...pageData}
      />
      ))}
    </group>
  );
};