import React from 'react';
import { Grid, Box } from '@react-three/drei';
import * as THREE from 'three';

export const FactoryFloor: React.FC = () => {
  const floorSize = 100;
  const wallHeight = 10;

  return (
    <group>
      {/* Main Grid */}
      <Grid
        infiniteGrid
        fadeDistance={50}
        fadeStrength={5}
        cellSize={1}
        sectionSize={5}
        sectionColor="#334155"
        cellColor="#1e293b"
      />
      
      {/* Floor Surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Building Walls */}
      <group>
        {/* Back Wall */}
        <Box args={[floorSize, wallHeight, 0.5]} position={[0, wallHeight / 2, -floorSize / 2]}>
          <meshStandardMaterial color="#334155" />
        </Box>
        {/* Front Wall (with opening) */}
        <group position={[0, wallHeight / 2, floorSize / 2]}>
          <Box args={[floorSize / 2 - 5, wallHeight, 0.5]} position={[-floorSize / 4 - 2.5, 0, 0]}>
            <meshStandardMaterial color="#334155" />
          </Box>
          <Box args={[floorSize / 2 - 5, wallHeight, 0.5]} position={[floorSize / 4 + 2.5, 0, 0]}>
            <meshStandardMaterial color="#334155" />
          </Box>
          <Box args={[10, 2, 0.5]} position={[0, wallHeight / 2 - 1, 0]}>
            <meshStandardMaterial color="#334155" />
          </Box>
        </group>
        {/* Left Wall with Windows */}
        <group position={[-floorSize / 2, wallHeight / 2, 0]}>
          <Box args={[0.5, wallHeight, floorSize]}>
            <meshStandardMaterial color="#334155" />
          </Box>
          {/* Windows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <Box 
              key={i} 
              args={[0.6, 3, 6]} 
              position={[0, 1, -floorSize / 3 + i * (floorSize / 6)]}
            >
              <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} metalness={1} roughness={0} />
            </Box>
          ))}
        </group>
        {/* Right Wall with Windows */}
        <group position={[floorSize / 2, wallHeight / 2, 0]}>
          <Box args={[0.5, wallHeight, floorSize]}>
            <meshStandardMaterial color="#334155" />
          </Box>
          {/* Windows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <Box 
              key={i} 
              args={[0.6, 3, 6]} 
              position={[0, 1, -floorSize / 3 + i * (floorSize / 6)]}
            >
              <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} metalness={1} roughness={0} />
            </Box>
          ))}
        </group>

      </group>

      {/* Origin Marker */}
      <axesHelper args={[5]} />
    </group>
  );
};
