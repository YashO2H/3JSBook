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
const RATIO = 1.05;
const SEGMENT_WIDTH = PAGE_WIDTH * RATIO / PAGE_SEGMENTS;

// Function to create a page geometry with custom depth
const createPageGeometry = (depth = PAGE_DEPTH, isCover) => {
    const width = isCover ? PAGE_WIDTH * RATIO : PAGE_WIDTH;
    const height = isCover ? PAGE_HEIGHT * RATIO : PAGE_HEIGHT;
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
        useTexture.preload(`/textures/book-cover-roughness.png`);
    });
};

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
    const isCover = number === 0 || number === pages.length - 1;
    const [picture, picture2, ..._rest] = useTexture([
        `/textures/${front}.jpg`,
        `/textures/${back}.jpg`,
        ...(isCover ? [`/textures/book-cover-roughness.png`] : []),
    ]);

    picture.colorSpace = picture2.colorSpace = SRGBColorSpace;
    // Main group for the page
    const group = useRef();
    // Separate pivot for covers (if needed)
    const pivot = useRef();

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
        const selectedGeometry = isCover ? coverGeometry : pageGeometry;

        const materials = [
            ...pageMaterials,
            new MeshStandardMaterial({
                color: isCover ? coverColor : whiteColor,
                map: picture,
                roughness: isCover ? 0.2 : 0.1,
                emissive: emissiveColor,
                emissiveIntensity: 0,
            }),
            new MeshStandardMaterial({
                color: isCover ? coverColor : whiteColor,
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

    useFrame((_, delta) => {
        if (!skinnedMeshRef.current) return;

        // Set emissive intensity when highlighted
        const emissiveIntensity = highlighted ? 0.22 : 0;
        skinnedMeshRef.current.material[4].emissiveIntensity =
            skinnedMeshRef.current.material[5].emissiveIntensity =
            MathUtils.lerp(
                skinnedMeshRef.current.material[4].emissiveIntensity,
                emissiveIntensity,
                0.1
            );

        // Track open/close timing changes
        if (lastOpened.current !== opened) {
            turnedAt.current = +new Date();
        }
        lastOpened.current = opened;
        let turningTime = Math.min(400, new Date() - turnedAt.current) / 400;
        turningTime = Math.sin(turningTime * Math.PI);

        // Calculate a base target rotation for regular pages.
        let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2;

        // If the book is not closed, adjust the rotation based on page index.
        // if (!bookClosed) {
            const middleIndex = (pages.length - 1) / 2;
            const offsetFromMiddle = number - middleIndex;
            targetRotation += degToRad(number * 0.2);
        // }

        easing.dampAngle(group.current.rotation, "y", targetRotation, easingFactor, delta);

        // The rest of the bone logic remains the same:
        const dynamicMultiplier = 0.06 + (0.082 - 0.06) * (50 - pages.length) / (50 - 20);
        const bones = skinnedMeshRef.current.skeleton.bones;
        for (let i = 0; i < bones.length; i++) {
            const target = i === 0 ? group.current : bones[i];
            const insideCurveIntensity = i < 8 ? Math.sin(i * dynamicMultiplier) : 0;
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

            // We keep these lines to show the old Y rotation approach:
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
        // }
    });

    const [_, setPage] = useAtom(pageAtom);
    const [highlighted, setHighlighted] = useState(false);
    useCursor(highlighted);

    return (
        <group
            {...props}
            ref={group}
            // Default rotation for the page group
            onPointerEnter={(e) => {
                e.stopPropagation();
                setHighlighted(true);
            }}
            onPointerLeave={(e) => {
                e.stopPropagation();
                setHighlighted(false);
            }}
        // onClick={(e) => {
        //   console.log(bookClosed);
        //   e.stopPropagation();
        //   setPage(opened ? number : number + 1);
        //   setHighlighted(false);
        // }}
        >

            <primitive
                ref={skinnedMeshRef}
                object={manualSkinnedMesh}
                // position-z={-number * PAGE_DEPTH + page * PAGE_DEPTH}
            />

        </group>
    );
};

export const NoSpineBook = ({ ...props }) => {
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