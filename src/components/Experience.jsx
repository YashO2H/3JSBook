import { Environment, Float, OrbitControls } from "@react-three/drei";
import { Book } from "./Book";
import { RigidBook } from "./RigidBook";
import { Canvas } from "@react-three/fiber";
import { SpineBook } from "./WithoutSpineBook";
import { SoftBook } from "./SoftBook";
export const Experience = () => {
  return (
    <>
        <Book />
        {/* <SpineBook /> */}
        {/* <RigidBook /> */}
        {/* <SoftBook /> */}
        <OrbitControls />
        <Environment preset="studio"></Environment>
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
    </>
  );
};
