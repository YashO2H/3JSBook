import { useEffect, useMemo, useRef, useState } from "react"
import { getPages, pageAtom } from './UI'
import { Bone, BoxGeometry, Color, Float32BufferAttribute, MathUtils, MeshStandardMaterial, Skeleton, SkinnedMesh, SRGBColorSpace, Uint16BufferAttribute, Vector3 } from "three";
import { useCursor, useTexture } from "@react-three/drei";
import { useAtom } from "jotai";
import { useFrame, useLoader } from "@react-three/fiber";
import { degToRad } from "three/src/math/MathUtils.js";
import { easing } from "maath";
import * as THREE from "three"
import { svgStringToPngBlobUrl } from "./HelperFunction";

// Animation and curve control constants
const easingFactor = 0.5;
const easingFactorFold = 0.3;
// Try smaller values:
const insideCurveStrength = 0.18;   // was 0.18
const outsideCurveStrength = 0.05;  // was 0.05
const turningCurveStrength = 0.09;  // was 0.09


const PAGE_SEGMENTS = 30;
const TRANSPARENT_PX =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="

// Function to create a page geometry with custom depth
const createPageGeometry = (depth, PAGE_WIDTH, PAGE_HEIGHT, COVER_WIDTH, COVER_HEIGTH, SEGMENT_WIDTH, isCover) => {
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

// Materials
const whiteColor = new Color("white");
const emissiveColor = new Color("orange");
const coverColor = new Color("#e8dbc5");

// Spine component as a separate mesh
const Spine = ({ totalPages, COVER_HEIGTH, COVER_DEPTH, PAGE_DEPTH, SPINE_WIDTH,currentPage, bookClosed, children }) => {
    const spineRef = useRef()

    // Calculate spine dimensions
    const SPINE_HEIGHT = COVER_HEIGTH
    const SPINE_DEPTH = COVER_DEPTH
    const CURVE_RADIUS = SPINE_WIDTH / Math.PI;

    // Create spine geometry
    const spineGeometry = useMemo(() => {
        const geometry = new THREE.BoxGeometry(
          SPINE_WIDTH,
          SPINE_HEIGHT,
          COVER_DEPTH,
          20, // widthSegments for smooth curve
          1,
          20  // depthSegments so inset shows gradation
        );
      
        const pos = geometry.attributes.position;
        const v   = new THREE.Vector3();
      
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
      
          const isFrontOrBack = Math.abs(v.z) === COVER_DEPTH / 2;
          if (!isFrontOrBack) {
            // compute inset amount
            const curveAngle = (v.x / SPINE_WIDTH) * (Math.PI / 2);
            const inset      = (CURVE_RADIUS - Math.cos(curveAngle) * CURVE_RADIUS);
            const sign       = Math.sign(v.z);
      
            // original depth ±COVER_DEPTH/2, plus curve inset
            v.z = sign * (COVER_DEPTH / 2) + inset;
          }
      
          pos.setXYZ(i, v.x, v.y, v.z);
        }
      
        pos.needsUpdate = true;
        geometry.computeVertexNormals();

        geometry.translate(0, 0, -SPINE_WIDTH/10);
      
        return geometry;
      }, [SPINE_WIDTH, SPINE_HEIGHT, COVER_DEPTH]);
      

    // Load spine texture
    // const spineTexture = useLoader(THREE.TextureLoader, `/textures/spine.jpg`)
    // spineTexture.colorSpace = SRGBColorSpace
    // spineTexture.wrapS = THREE.ClampToEdgeWrapping
    // spineTexture.wrapT = THREE.ClampToEdgeWrapping

    // Create materials
    const materials = useMemo(() => {
        const plainMaterial = new MeshStandardMaterial({
            color: coverColor,
            roughness: 0.3,
        })

        const texturedMaterial = new MeshStandardMaterial({
            // map: spineTexture,
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
    }, [])

    // Same rotation logic you already had
    useFrame((_, delta) => {
        if (!spineRef.current) return

        // Calculate normalized progress
        const normalizedProgress =
            currentPage === 1 ? 0 : currentPage / (totalPages)

        // Two-phase rotation logic
        const halfProgress = normalizedProgress * 2
        const targetRotation = new THREE.Euler(
            0,
            currentPage === 1 ? -Math.PI : 0,
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
            if (currentPage === 1 || currentPage === totalPages - 1) {
                easing.damp3(spineRef.current.position, spinePosition, easingFactor, delta)
                easing.dampE(spineRef.current.rotation, targetRotation, easingFactor, delta)
            } else {
                easing.damp3(spineRef.current.position, spinePosition, easingFactor, delta)
                easing.dampE(
                    spineRef.current.rotation,
                    new THREE.Euler(0, Math.PI / 2, 0),
                    easingFactor,
                    delta
                )
            }
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

// Cover component (for both front and back)
const Cover = ({ isBackCover, bookClosed, frontCover,SPINE_WIDTH, backCover,PAGE_DEPTH, frontCoverInner, backCoverInner, currentPage, SEGMENT_WIDTH, coverGeometry, totalPages, ...props }) => {
    const coverRef = useRef()
    const pivotRef = useRef()
    const [hovered, setHovered] = useState(false)
    const [, setPage] = useAtom(pageAtom)

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
            if (currentPage === 1 || currentPage === totalPages - 1) {
                const coverSpread = SPINE_WIDTH / 2
                const angularSpread = Math.PI / 2
                const halfProgress = normalizedProgress * 2

                if (currentPage <= Math.floor((totalPages) / 2)) {
                    // front half
                    targetRotation = isBackCover ? -angularSpread : angularSpread
                    targetPosition = new THREE.Vector3(
                        isBackCover
                            ? SPINE_WIDTH / 2 - coverSpread * halfProgress
                            : -SPINE_WIDTH / 2 + coverSpread * halfProgress,
                        0,
                        0
                    )
                } else {
                    // back half
                    targetRotation = isBackCover ? -angularSpread : angularSpread
                    targetPosition = new THREE.Vector3(
                        isBackCover
                            ? SPINE_WIDTH / 2 - coverSpread * halfProgress
                            : -SPINE_WIDTH / 2 + coverSpread * halfProgress,
                        0,
                        0
                    )
                }
            } else {
                targetRotation = isBackCover ? -Math.PI / 2 : Math.PI / 2
                targetPosition = new THREE.Vector3(
                    0,
                    0,
                    isBackCover ? SPINE_WIDTH / 2 : -SPINE_WIDTH / 2
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

// Page component (inner pages)
const Page = ({
    key,
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
    visible,
    SEGMENT_WIDTH,
    SPINE_WIDTH,
    PAGE_DEPTH
}) => {
    if (!visible) return null;
    const [clickedPage, setPage] = useAtom(pageAtom);
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
    // Main group for the page
    const group = useRef();

    const turnedAt = useRef(0);
    const lastOpened = useRef(opened);

    const skinnedMeshRef = useRef();

    // Materials for regular pages
    const pageMaterials = useMemo(
        () => [
            new MeshStandardMaterial({ color: "white" }),
            new MeshStandardMaterial({ color: "white" }),
            new MeshStandardMaterial({ color: "white" }),
            new MeshStandardMaterial({ color: "white" }),
        ],
        []
    );

    // Create the skinned mesh with its bone hierarchy.
    const manualSkinnedMesh = useMemo(() => {
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
        const selectedGeometry = pageGeometry;

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
        ];

        const mesh = new SkinnedMesh(selectedGeometry, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        // Add the skeleton root bone to the mesh and bind.
        mesh.add(skeleton.bones[0]);
        mesh.bind(skeleton);

        return mesh;
    }, [picture, picture2]);


    useFrame((_, delta) => {
        if (!skinnedMeshRef.current || !skinnedMeshRef.current.skeleton || !group.current) return;

        const targetZGroup =
            clickedPage !== 1 && clickedPage !== totalPages - 1 ? (SPINE_WIDTH / 2) - (number * PAGE_DEPTH) : 0;
        const targetZPrimitive =
            clickedPage === 1 || clickedPage === totalPages - 1 ? (SPINE_WIDTH / 2) - (number * PAGE_DEPTH) : 0;

        // Smoothly update the group's Z position.
        group.current.position.z = MathUtils.lerp(
            group.current.position.z,
            targetZGroup,
            easingFactor,
            delta
        );

        // Smoothly update the primitive's Z position.
        skinnedMeshRef.current.position.z = MathUtils.lerp(
            skinnedMeshRef.current.position.z,
            targetZPrimitive,
            easingFactor,
            delta
        );

        // Track open/close timing changes
        if (lastOpened.current !== opened) {
            turnedAt.current = +new Date();
        }
        lastOpened.current = opened;
        let turningTime = Math.min(400, new Date() - turnedAt.current) / 400;
        turningTime = Math.sin(turningTime * -Math.PI);

        let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2;

        if (!bookClosed) {
            const middleIndex = (totalPages) / 2;
            const offsetFromMiddle = number - middleIndex;
            targetRotation += degToRad(offsetFromMiddle * 0.6);
        }

        // Apply positioning logic based on book state
        if (bookClosed) {
            // When book is closed, flatten all pages
            easing.dampAngle(group.current.rotation, "y", 0, easingFactor, delta);

            const bones = skinnedMeshRef.current.skeleton.bones;
            for (let i = 0; i < bones.length; i++) {
                easing.dampAngle(bones[i].rotation, "y", 0, easingFactor, delta);
                easing.dampAngle(bones[i].rotation, "x", 0, easingFactor, delta);
            }
        } else {

            if (clickedPage === 1) {
                easing.dampAngle(group.current.rotation, "y", Math.PI / 2, easingFactor, delta)
                skinnedMeshRef.current.skeleton.bones.forEach((b) => {
                    easing.dampAngle(b.rotation, "y", 0, easingFactor, delta)
                    easing.dampAngle(b.rotation, "x", 0, easingFactor, delta)
                })
            } else if (clickedPage === totalPages - 1) {
                easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta)
                skinnedMeshRef.current.skeleton.bones.forEach((b) => {
                    easing.dampAngle(b.rotation, "y", 0, easingFactor, delta)
                    easing.dampAngle(b.rotation, "x", 0, easingFactor, delta)
                })
            } else {
                // Damp the page group's rotation around Y
                // easing.dampAngle(group.current.rotation, "y", targetRotation, easingFactor, delta);

                // Calculate the number of inner pages (exclude the two covers)
                const innerPages = totalPages;

                // Define the effective range for inner pages
                const minInnerPages = 3;         // Minimum inner page count (3 pages total gives 1 inner page)
                const maxInnerPages = 50;     // Maximum inner page count (if total pages = 300, then 298 inner pages)

                // Desired dynamic multiplier values at the extremes
                const startValue = 0.45;         // Dynamic multiplier for minInnerPages
                const endValue = 0.31;        // Dynamic multiplier for maxInnerPages

                // Correct interpolation based on the inner page count
                const dynamicMultiplier =
                    startValue +
                    (endValue - startValue) * ((innerPages - minInnerPages) / (maxInnerPages - minInnerPages));

                const bones = skinnedMeshRef.current.skeleton.bones;
                for (let i = 0; i < bones.length; i++) {
                    const target = i === 0 ? group.current : bones[i];
                    const insideCurveIntensity = i < 8 ? Math.sin(i * 0.1 + dynamicMultiplier) : 0;
                    const outsideCurveIntensity = i >= 8 ? Math.cos(i * 0.3) : 0;
                    const turningIntensity =
                        Math.sin(i * Math.PI * (1 / bones.length)) * turningTime;
                    let rotationAngle =
                        insideCurveStrength * insideCurveIntensity * targetRotation -
                        outsideCurveStrength * outsideCurveIntensity * targetRotation +
                        turningCurveStrength * turningIntensity * targetRotation;
                    let foldRotationAngle = degToRad(Math.sign(targetRotation) * 2);
                    if (bookClosed) {
                        rotationAngle = 0;
                        foldRotationAngle = 0;
                    }

                    easing.dampAngle(target.rotation, "y", rotationAngle, easingFactor, delta);

                    // Apply folding effect
                    const foldIntensity =
                        i > 8
                            ? Math.sin((i * Math.PI) / bones.length - 0.5) * turningTime
                            : 0;

                    easing.dampAngle(
                        bones[i].rotation,
                        "x",
                        foldRotationAngle * foldIntensity,
                        easingFactorFold,
                        delta
                    );
                }
            }
        }
    });

    const [highlighted, setHighlighted] = useState(false);
    useCursor(highlighted);

    // Fix: Improve positioning of pages relative to spine
    // The key issue was that page positions were not properly aligned with the spine
    return (
        <group
            ref={group}
            position={[0, 0, 0]}
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
                ref={skinnedMeshRef}
                object={manualSkinnedMesh}
            />
        </group>
    );
};


// Main Book component
export const Book = ({ pageImages = [],         // ← destructured here
    pageWidth,
    pageHeight,
    pageDepth,
    coverDepth,
    coverHeight,
    coverWidth,
    spineWidth,
    nextPage }) => {

    const [page] = useAtom(pageAtom)
    const [delayedPage, setDelayedPage] = useState(page)
    const spine = pageImages[pageImages.length - 1];
    const frontCover = pageImages[0]
    const frontCoverInner = pageImages[1]
    const backCover = pageImages[pageImages.length - 1]
    const backCoverInner = pageImages[pageImages.length - 2]
    const pages = getPages(pageImages.slice(2, -2), true);
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
    return (
        <group
        >
            <group>
                {/* Front Cover - positioned relative to spine */}
                <Cover
                    isBackCover={false}
                    bookClosed={bookClosed}
                    currentPage={delayedPage}
                    totalPages={totalPages}
                    frontCover={frontCover}
                    frontCoverInner={frontCoverInner}
                    backCover={backCover}
                    backCoverInner={backCoverInner}
                    SEGMENT_WIDTH={SEGMENT_WIDTH}
                    coverGeometry={coverGeometry}
                    SPINE_WIDTH={spineWidth}
                    PAGE_DEPTH={PAGE_DEPTH}
                />
                {/* Spine - Positioning it first in the component tree */}
                <Spine
                    totalPages={totalPages}
                    currentPage={delayedPage}
                    bookClosed={bookClosed}
                    COVER_DEPTH={COVER_DEPTH}
                    PAGE_DEPTH={PAGE_DEPTH}
                    COVER_HEIGTH={COVER_HEIGTH}
                    SPINE_WIDTH={spineWidth}
                />

                {/* Inner Pages - with fixed positioning */}
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
                                visible={isVisible} // Pass visibility here
                                SPINE_WIDTH={spineWidth}
                                PAGE_DEPTH={PAGE_DEPTH}
                                {...pageData}
                            />
                        );
                    })}
                </group>
                <Cover
                    isBackCover={true}
                    bookClosed={bookClosed}
                    currentPage={delayedPage}
                    totalPages={totalPages}
                    frontCover={frontCover}
                    frontCoverInner={frontCoverInner}
                    backCover={backCover}
                    backCoverInner={backCoverInner}
                    SEGMENT_WIDTH={SEGMENT_WIDTH}
                    PAGE_DEPTH={PAGE_DEPTH}
                    coverGeometry={coverGeometry}
                    SPINE_WIDTH={spineWidth}
                />

            </group>
        </group >
    );
}