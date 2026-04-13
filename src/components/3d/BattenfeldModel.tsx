import React from 'react';
import { Box, Cylinder, Text, Edges, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { Machine as MachineType } from '../../types';

interface BattenfeldModelProps {
  machine: MachineType;
  isSelected: boolean;
  hovered: boolean;
}

export const BattenfeldModel: React.FC<BattenfeldModelProps> = ({ machine, isSelected, hovered }) => {
  const baseColor = "#f8fafc"; // White/Cream from image
  const blueColor = "#1e40af"; // Deep blue for the pillar and panel
  const greyColor = "#64748b"; // Grey for details

  // Default dimensions
  const width = 4.5;
  const height = 2.1;
  const depth = 1.6;

  const baseHeight = height * 0.5;
  const upperHeight = height * 0.5;

  return (
    <group>
      {/* 1. Main White Base */}
      <group position={[0, baseHeight / 2, 0]}>
        <Box args={[width, baseHeight, depth]}>
          <meshStandardMaterial
            color={baseColor}
            metalness={0.1}
            roughness={0.9}
            emissive={isSelected ? "#ffffff" : hovered ? "#ffffff" : "#000000"}
            emissiveIntensity={isSelected ? 0.2 : hovered ? 0.1 : 0}
          />
          <Edges color="#cbd5e1" />
        </Box>

        {/* Manifold/Hydraulic details on bottom left */}
        <group position={[-width * 0.35, -baseHeight * 0.1, depth / 2 + 0.05]}>
          <Box args={[width * 0.2, baseHeight * 0.4, 0.1]}>
            <meshStandardMaterial color="#475569" />
          </Box>
          {/* Small pipes/valves */}
          {[-0.1, 0, 0.1].map((x, i) => (
            <Cylinder key={i} args={[0.01, 0.01, 0.3]} position={[x, 0, 0.05]}>
              <meshStandardMaterial color="#94a3b8" metalness={0.8} />
            </Cylinder>
          ))}
        </group>

        {/* Chute/Opening in the middle bottom */}
        <Box args={[width * 0.2, baseHeight * 0.4, depth * 0.8]} position={[0, -baseHeight * 0.3, 0]}>
          <meshStandardMaterial color="#1e293b" />
        </Box>
      </group>

      {/* 2. Upper Unit - Clamping (Left) */}
      <group position={[-width * 0.25, baseHeight + upperHeight * 0.5, 0]}>
        <Box args={[width * 0.5, upperHeight, depth]}>
          <meshStandardMaterial color={baseColor} />
          <Edges color="#cbd5e1" />
        </Box>

        {/* "HM 65/130" Text */}
        <Text
          position={[-width * 0.15, upperHeight * 0.3, depth / 2 + 0.01]}
          fontSize={0.15}
          color="#1e3a8a"
          fontWeight="bold"
          anchorX="left"
        >
          HM 65/130
        </Text>

        {/* Safety Window */}
        <Box args={[width * 0.35, upperHeight * 0.6, 0.02]} position={[width * 0.05, 0, depth / 2 + 0.01]}>
          <meshStandardMaterial color="#1e293b" transparent opacity={0.4} />
          <Edges color="#94a3b8" />
        </Box>
      </group>

      {/* 3. Blue Vertical Pillar (Center-Right) */}
      <group position={[width * 0.05, height / 2, depth / 2]}>
        <Box args={[0.15, height, 0.2]}>
          <meshStandardMaterial color={blueColor} metalness={0.3} roughness={0.5} />
        </Box>

        {/* Warning Light on Top */}
        <group position={[0, height / 2 + 0.05, 0]}>
          <Cylinder args={[0.04, 0.04, 0.1]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
          </Cylinder>
        </group>
      </group>

      {/* 4. Control Panel (Mounted on Blue Pillar) */}
      <group position={[width * 0.15, height * 0.7, depth / 2 + 0.1]}>
        <Box args={[0.6, 0.7, 0.1]}>
          <meshStandardMaterial color={blueColor} />
          <Edges color="#1e3a8a" />
        </Box>
        {/* Screen Area (White/Grey background) */}
        <Box args={[0.5, 0.35, 0.02]} position={[0, 0.15, 0.05]}>
          <meshStandardMaterial color="#cf1096" />
        </Box>
        {/* Actual Screen */}
        <Box args={[0.4, 0.25, 0.01]} position={[0, 0.15, 0.06]}>
          <meshStandardMaterial color="#000000" emissive="#3b82f6" emissiveIntensity={0.3} />
        </Box>
        {/* Buttons Grid */}
        <group position={[0, -0.15, 0.06]}>
          {[-0.2, -0.1, 0, 0.1, 0.2].map(x => [-0.1, 0, 0.1].map(y => (
            <Box key={`${x}-${y}`} args={[0.06, 0.06, 0.01]} position={[x, y, 0]}>
              <meshStandardMaterial color="#ffffff" />
            </Box>
          )))}
        </group>
      </group>

      {/* 5. Injection Unit (Right) */}
      <group position={[width * 0.3, baseHeight + upperHeight * 0.4, 0]}>
        <Box args={[width * 0.4, upperHeight * 0.8, depth * 0.9]}>
          <meshStandardMaterial color={baseColor} />
          <Edges color="#cbd5e1" />
        </Box>
        {/* Barrel/Nozzle area */}
        <Cylinder args={[0.1, 0.1, 0.4]} rotation={[0, 0, Math.PI / 2]} position={[width * 0.2, 0, 0]}>
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </Cylinder>
      </group>
    </group>
  );
};
