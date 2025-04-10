import { useEffect, useMemo, useRef, useState } from "react"
import { pageAtom, pages } from './UI'
import { Bone, BoxGeometry, Color, Float32BufferAttribute, MathUtils, MeshStandardMaterial, Skeleton, SkinnedMesh, SRGBColorSpace, Uint16BufferAttribute, Vector3 } from "three";
import { useCursor, useTexture } from "@react-three/drei";
import { useAtom } from "jotai";
import { useFrame, useLoader } from "@react-three/fiber";
import { degToRad } from "three/src/math/MathUtils.js";
import { easing } from "maath";
import * as THREE from "three"

// Animation and curve control constants
const easingFactor = 0.5;
const easingFactorFold = 0.3;
// Try smaller values:
const insideCurveStrength = 0.18;   // was 0.18
const outsideCurveStrength = 0.05;  // was 0.05
const turningCurveStrength = 0.09;  // was 0.09


// Book dimensions
const PAGE_WIDTH = 1.28;
const PAGE_HEIGHT = 1.71;
const PAGE_DEPTH = 0.003;
const COVER_DEPTH = 0.009;
const COVER_EXTENSION = 0.05; // How much the cover extends beyond pages
const PAGE_SEGMENTS = 30;
const RATIO = 1.05;
const SEGMENT_WIDTH = PAGE_WIDTH * RATIO / PAGE_SEGMENTS;

// Function to create a page geometry with custom depth
const createPageGeometry = (depth = PAGE_DEPTH, isCover) => {
    const width = isCover ? PAGE_WIDTH * RATIO + COVER_EXTENSION : PAGE_WIDTH;
    const height = isCover ? PAGE_HEIGHT * RATIO + COVER_EXTENSION : PAGE_HEIGHT;
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

// Create geometries
const pageGeometry = createPageGeometry(PAGE_DEPTH, false);
const coverGeometry = createPageGeometry(COVER_DEPTH, true);

// Materials
const whiteColor = new Color("white");
const emissiveColor = new Color("orange");
const coverColor = new Color("#e8dbc5");

// Preload all textures
const preloadTextures = () => {
    useTexture.preload(`/textures/spine.jpg`);
    useTexture.preload(`/textures/book-cover.jpg`);
    useTexture.preload(`/textures/book-back.jpg`);
    useTexture.preload(`/textures/book-cover-roughness.png`);

    pages.forEach((page) => {
        useTexture.preload(`/textures/${page.front}.jpg`);
        useTexture.preload(`/textures/${page.back}.jpg`);
    });
};

// Spine component as a separate mesh
const Spine = ({ totalPages, currentPage, bookClosed, children }) => {
    const spineRef = useRef()

    // Calculate spine dimensions
    const SPINE_HEIGHT = PAGE_HEIGHT * RATIO + COVER_EXTENSION
    const SPINE_DEPTH = COVER_DEPTH
    const SPINE_WIDTH = PAGE_DEPTH * (totalPages - 2) // front/back covers excluded
    const CURVE_RADIUS = SPINE_WIDTH / Math.PI;

    // Create spine geometry
    const spineGeometry = useMemo(() => {
        const geometry = new THREE.BoxGeometry(
            SPINE_WIDTH,
            SPINE_HEIGHT,
            SPINE_DEPTH,
            20, // More segments for smooth curvature
            1,
            1
        );

        const position = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);

            // Check if vertex is on the curved face (front or back)
            const isFrontOrBack = Math.abs(vertex.z) === SPINE_DEPTH / 2;

            if (!isFrontOrBack) {
                // Apply U-curve only to the central area
                const curveAngle = (vertex.x / SPINE_WIDTH) * (Math.PI / 2); // Map X position to curve
                const newZ = -Math.cos(curveAngle) * CURVE_RADIUS + CURVE_RADIUS * 1.4 / 2;

                // Blend the curved Z smoothly while keeping original depth
                vertex.z = THREE.MathUtils.lerp(vertex.z, newZ, 0.9);
            }

            position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        position.needsUpdate = true;
        return geometry;
    }, [SPINE_WIDTH, SPINE_HEIGHT, SPINE_DEPTH]);

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
            currentPage === 1 ? 0 : currentPage / (totalPages - 2)

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
            if (currentPage === 1 || currentPage === pages.length - 1) {
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
const Cover = ({ isBackCover, bookClosed, currentPage, totalPages, ...props }) => {
    const coverRef = useRef()
    const pivotRef = useRef()
    const [hovered, setHovered] = useState(false)
    const [, setPage] = useAtom(pageAtom)

    // Load cover textures
    const [coverTexture, coverRoughness] = useTexture([
        `/textures/book-${isBackCover ? "back" : "cover"}.jpg`,
        `/textures/book-cover-roughness.png`,
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
                color: '#ACE1AF',
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
            if (currentPage === 1 || currentPage === pages.length - 1) {
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
    ...props
}) => {
    const [clickedPage, setPage] = useAtom(pageAtom);
    const isCover = number === 0 || number === pages.length - 1;
    const [picture, picture2, ..._rest] = useTexture([
        `/textures/${front}.jpg`,
        `/textures/${back}.jpg`,
        ...(isCover ? [`/textures/book-cover-roughness.png`] : []),
    ]);

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
    }, []);

    // Fix: Calculate spine width for proper page positioning
    const SPINE_WIDTH = PAGE_DEPTH * (pages.length - 2);

    useFrame((_, delta) => {
        if (!skinnedMeshRef.current || !skinnedMeshRef.current.skeleton || !group.current) return;

        const targetZGroup =
            clickedPage !== 1 && clickedPage !== pages.length - 1 ? (SPINE_WIDTH / 2) - (number * PAGE_DEPTH) : 0;
        const targetZPrimitive =
            clickedPage === 1 || clickedPage === pages.length - 1 ? (SPINE_WIDTH / 2) - (number * PAGE_DEPTH) : 0;

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
            const middleIndex = (pages.length - 1) / 2;
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
            } else if (clickedPage === pages.length - 1) {
                easing.dampAngle(group.current.rotation, "y", -Math.PI / 2, easingFactor, delta)
                skinnedMeshRef.current.skeleton.bones.forEach((b) => {
                    easing.dampAngle(b.rotation, "y", 0, easingFactor, delta)
                    easing.dampAngle(b.rotation, "x", 0, easingFactor, delta)
                })
            } else {
                // Damp the page group's rotation around Y
                // easing.dampAngle(group.current.rotation, "y", targetRotation, easingFactor, delta);

                // Calculate the number of inner pages (exclude the two covers)
                const innerPages = pages.length - 2;

                // Define the effective range for inner pages
                const minInnerPages = 3;         // Minimum inner page count (3 pages total gives 1 inner page)
                const maxInnerPages = 50;     // Maximum inner page count (if total pages = 300, then 298 inner pages)

                // Desired dynamic multiplier values at the extremes
                const startValue = 0.46;         // Dynamic multiplier for minInnerPages
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
            {...props}
            ref={group}
            position={[0.005, 0, 0]}
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
            />
        </group>
    );
};


// Main Book component
export const Book = ({ ...props }) => {
    const [page, setPage] = useAtom(pageAtom)
    const [delayedPage, setDelayedPage] = useState(page);
    const totalPages = pages.length;

    // Handle smooth page transitions
    useEffect(() => {
        let timeout;
        const goToPage = () => {
            if (page === delayedPage) {
                return;
            } else {
                const increment = page > delayedPage ? 1 : -1;
                timeout = setTimeout(() => {
                    setDelayedPage(prevPage => prevPage + increment);
                    goToPage();
                }, Math.abs(page - delayedPage) > 2 ? 50 : 150);
            }
        };
        goToPage();
        return () => {
            clearTimeout(timeout);
        };
    }, [page, delayedPage]);

    // Preload textures when component mounts
    useEffect(() => {
        try {
            preloadTextures();
        } catch (error) {
            console.error("Error preloading textures:", error);
        }
    }, []);

    // Determine if book is closed
    const bookClosed = delayedPage === 0 || delayedPage === totalPages;

    return (
        <group
            {...props}
            onClick={(e) => {
                // Add a background click handler to close the book if needed
                if (!bookClosed) {
                    e.stopPropagation();
                    setPage(0); // Close the book when clicking outside pages
                }
            }}
        >
            <group>
                {/* Front Cover - positioned relative to spine */}
                <Cover
                    isBackCover={false}
                    bookClosed={bookClosed}
                    currentPage={delayedPage}
                    totalPages={totalPages}
                />
                {/* Spine - Positioning it first in the component tree */}
                <Spine
                    totalPages={totalPages}
                    currentPage={delayedPage}
                    bookClosed={bookClosed}
                />

                {/* Inner Pages - with fixed positioning */}
                {[...pages].slice(1, -1).map((pageData, index) => (
                    <>
                        <Page
                            key={index}
                            page={delayedPage}
                            number={index + 1} // Adjusted to account for 0-indexed array but 1-indexed pages
                            opened={delayedPage > index + 1}
                            bookClosed={bookClosed}
                            {...pageData}
                        />
                        {/* Back Cover - positioned relative to spine */}
                    </>
                ))}
                <Cover
                    isBackCover={true}
                    bookClosed={bookClosed}
                    currentPage={delayedPage}
                    totalPages={totalPages}
                />

            </group>
        </group>
    );
}