// First, let's modify your Experience component to accept props
import { Environment, Float, OrbitControls } from "@react-three/drei";
import { Book } from "./Book";
import { RigidBook } from "./RigidBook";
import { NoSpineBook } from "./WithoutSpineBook";
import { SoftBook } from "./SoftBook";
import { UI } from "./UI";
import { useMemo } from "react";
import { Soft } from "./Soft";


// Modified to accept props from the mounting function
export const Experience = ({ 
  bookType = 'standard', // Default book type
  pageImages = [],      // Array of image URLs for pages
  pageWidth = 1,        // Default width
  pageHeight = 1.5,     // Default height
  pageDepth = 0.001,   
  coverDepth = 0.001,   // Default depth/thickness
  coverWidth = 0.5,
  coverHeight = 0.5,
  spineWidth,
  nextPage = 0
}) => {
  // Determine which book component to render based on bookType
  const scale = useMemo(() => {
    const maxDim = Math.max(pageWidth, pageHeight);
    return 1.5 / maxDim;
  }, [pageWidth, pageHeight]);
  const renderBookComponent = () => {
    switch(bookType) {
      case 'Hard':
        return <Book 
        pageImages={pageImages}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        pageDepth={pageDepth}
        coverHeight={coverHeight}
        coverWidth = {coverWidth}
        nextPage = {nextPage}
        spineWidth = {spineWidth}
        coverDepth = {coverDepth}
        />;
      case 'nospine':
        return <NoSpineBook 
          pageImages={pageImages}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          pageDepth={pageDepth}
          coverHeight={coverHeight}
          coverWidth = {coverWidth}
          nextPage = {nextPage}
          spineWidth = {spineWidth}
        />;
      case 'layflat':
        return <RigidBook 
        pageImages={pageImages}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        pageDepth={pageDepth}
        coverHeight={coverHeight}
        coverWidth = {coverWidth}
        nextPage = {nextPage}
        spineWidth = {spineWidth}
        coverDepth = {coverDepth}
        />;
      case 'Soft':
        return <Soft 
        pageImages={pageImages}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        pageDepth={pageDepth}
        coverHeight={coverHeight}
        coverWidth = {coverWidth}
        nextPage = {nextPage}
        spineWidth = {spineWidth}
        coverDepth = {coverDepth}
        />;
      default:
        return <Book 
        pageImages={pageImages}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        pageDepth={pageDepth}
        coverHeight={coverHeight}
        coverWidth = {coverWidth}
        nextPage = {nextPage}
        spineWidth = {spineWidth}
        coverDepth = {coverDepth}
        />;
    }
  };

  return (
    <group scale={[scale, scale, scale]}>
      {renderBookComponent()}
      <OrbitControls  enableZoom={true}
        minDistance={2}   // closest you can dolly in
        maxDistance={10} />
      <Environment preset="studio" />
      <directionalLight
        position={[2, 5, 2]}
        intensity={2.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
      />
      <mesh position-y={-1.5} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial transparent opacity={0.2} />
      </mesh>
    </group>
  );
};