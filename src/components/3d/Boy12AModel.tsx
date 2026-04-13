import React from 'react';
import { Box, Cylinder, Cone, Sphere, Text, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { Machine as MachineType } from '../../types';

interface Boy12AModelProps {
  machine: MachineType;
  isSelected: boolean;
  hovered: boolean;
}

export const Boy12AModel: React.FC<Boy12AModelProps> = ({ machine, isSelected, hovered }) => {
  const baseColor = "#0891b2"; // Teal/Blue from image
  const yellowColor = "#facc15"; // Bright yellow from image
  const greyColor = "#94a3b8"; // Grey/Silver from image
  
  // Use default dimensions if not specifically defined in machine properties
  const width = 2.2;
  const height = 1.6;
  const depth = 1.0;

  const baseHeight = height * 0.5;
  const unitHeight = height * 0.5;

  return (
    <group>
      {/* 1. Main Teal Base */}
      <group position={[0, baseHeight / 2, 0]}>
        <Box args={[width, baseHeight, depth]}>
          <meshStandardMaterial 
            color={baseColor} 
            metalness={0.3} 
            roughness={0.7}
            emissive={isSelected ? "#ffffff" : hovered ? "#ffffff" : "#000000"}
            emissiveIntensity={isSelected ? 0.2 : hovered ? 0.1 : 0}
          />
          <Edges color="#0e7490" />
        </Box>
        
        {/* Base Details - Doors/Panels */}
        <Box args={[width * 0.4, baseHeight * 0.8, 0.05]} position={[width * 0.25, 0, depth / 2 + 0.01]}>
          <meshStandardMaterial color={baseColor} />
          <Edges color="#0e7490" />
        </Box>
        
        {/* Emergency Stop & Buttons on Base */}
        <group position={[0, baseHeight / 2 + 0.05, depth / 2 - 0.2]}>
          <Box args={[0.4, 0.1, 0.4]} position={[0, 0, 0]}>
            <meshStandardMaterial color="#1e293b" />
          </Box>
          <Sphere args={[0.04]} position={[0, 0.05, 0]}>
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" />
          </Sphere>
        </group>
      </group>

      {/* 2. Clamping Unit with Yellow Cover (Left) */}
      <group position={[-width * 0.25, baseHeight + unitHeight * 0.4, 0]}>
        {/* Yellow Safety Guard */}
        <Box args={[width * 0.5, unitHeight * 0.8, depth * 1.05]}>
          <meshStandardMaterial color={yellowColor} metalness={0.2} roughness={0.5} />
          <Edges color="#a16207" />
        </Box>
        
        {/* Window in the Yellow Guard */}
        <Box args={[width * 0.35, unitHeight * 0.5, 0.02]} position={[0, 0, depth / 2 + 0.03]}>
          <meshStandardMaterial color="#1e293b" transparent opacity={0.6} />
        </Box>
        
        {/* "BOY 12A" Text on Yellow Guard */}
        <Text
          position={[0, unitHeight * 0.3, depth / 2 + 0.04]}
          fontSize={0.15}
          color="black"
          fontWeight="bold"
        >
          BOY 12A
        </Text>

        {/* Internal Platens */}
        <Box args={[0.1, unitHeight * 0.6, depth * 0.8]} position={[width * 0.15, 0, 0]}>
          <meshStandardMaterial color="#475569" />
        </Box>
        <Box args={[0.1, unitHeight * 0.6, depth * 0.8]} position={[-width * 0.15, 0, 0]}>
          <meshStandardMaterial color="#475569" />
        </Box>
        {/* Tie Bars */}
        {[1, -1].map(y => [1, -1].map(z => (
          <Cylinder 
            key={`${y}-${z}`}
            args={[0.03, 0.03, width * 0.45]} 
            rotation={[0, 0, Math.PI / 2]} 
            position={[0, y * unitHeight * 0.25, z * depth * 0.3]}
          >
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} />
          </Cylinder>
        )))}
      </group>

      {/* 3. Injection Unit (Right) */}
      <group position={[width * 0.25, baseHeight + unitHeight * 0.4, 0]}>
        {/* Grey Body */}
        <Box args={[width * 0.5, unitHeight * 0.6, depth * 0.8]}>
          <meshStandardMaterial color={greyColor} metalness={0.4} roughness={0.6} />
          <Edges color="#475569" />
        </Box>
        
        {/* Hopper */}
        <group position={[width * 0.1, unitHeight * 0.3, 0]}>
          <Cone args={[depth * 0.25, unitHeight * 0.5, 4]} rotation={[0, Math.PI / 4, 0]}>
            <meshStandardMaterial color={greyColor} />
          </Cone>
        </group>
      </group>

      {/* 4. Control Panel on Arm */}
      <group position={[width * 0.1, baseHeight + unitHeight * 0.8, depth * 0.4]}>
        {/* Arm */}
        <Cylinder args={[0.03, 0.03, 0.5]} position={[0, 0, 0]}>
          <meshStandardMaterial color="#475569" />
        </Cylinder>
        {/* Panel Box */}
        <group position={[0, 0.3, 0.1]} rotation={[-0.2, 0, 0]}>
          <Box args={[0.6, 0.5, 0.1]}>
            <meshStandardMaterial color={greyColor} />
            <Edges color="#475569" />
          </Box>
          {/* Screen */}
          <Box args={[0.4, 0.3, 0.02]} position={[0, 0.05, 0.05]}>
            <meshStandardMaterial color="#000000" emissive="#22c55e" emissiveIntensity={0.2} />
          </Box>
          {/* Keypad */}
          <Box args={[0.4, 0.1, 0.02]} position={[0, -0.15, 0.05]}>
            <meshStandardMaterial color="#334155" />
          </Box>
        </group>
      </group>

      {/* Warning Light on Top */}
      <group position={[0, baseHeight + unitHeight * 0.8, 0]}>
        <Cylinder args={[0.05, 0.05, 0.1]}>
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
        </Cylinder>
      </group>
    </group>
  );
};
