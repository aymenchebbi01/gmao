import React from 'react';
import { Box, Cylinder, Text, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { Machine as MachineType } from '../../types';

interface KraussMaffeiModelProps {
  machine: MachineType;
  isSelected: boolean;
  hovered: boolean;
}

export const KraussMaffeiModel: React.FC<KraussMaffeiModelProps> = ({ machine, isSelected, hovered }) => {
  const baseColor = "#f5f5f4"; // Off-white/Cream from image
  const silverColor = "#94a3b8"; // Silver/Grey from image
  const logoColor = "#1e3a8a"; // Dark blue for logo
  
  // Default dimensions
  const width = 5;
  const height = 2.2;
  const depth = 1.8;

  const baseHeight = height * 0.4;
  const upperHeight = height * 0.6;

  return (
    <group>
      {/* 1. Main Off-White Base */}
      <group position={[0, baseHeight / 2, 0]}>
        <Box args={[width * 0.9, baseHeight, depth * 0.8]}>
          <meshStandardMaterial 
            color={baseColor} 
            metalness={0.2} 
            roughness={0.8}
            emissive={isSelected ? "#ffffff" : hovered ? "#ffffff" : "#000000"}
            emissiveIntensity={isSelected ? 0.2 : hovered ? 0.1 : 0}
          />
          <Edges color="#d6d3d1" />
        </Box>
        
        {/* Support Feet */}
        {[-1, 1].map(x => [-1, 1].map(z => (
          <Cylinder key={`${x}-${z}`} args={[0.1, 0.1, 0.1]} position={[x * (width * 0.4), -baseHeight / 2 - 0.05, z * (depth * 0.3)]}>
            <meshStandardMaterial color="#44403c" />
          </Cylinder>
        )))}
      </group>

      {/* 2. Clamping Unit with Large Glass Guard (Left) */}
      <group position={[-width * 0.15, baseHeight + upperHeight * 0.5, 0]}>
        {/* Silver Frame */}
        <Box args={[width * 0.6, upperHeight, depth * 0.95]}>
          <meshStandardMaterial color={silverColor} metalness={0.5} roughness={0.3} />
          <Edges color="#475569" />
        </Box>
        
        {/* Large Glass Window (Front) */}
        <group position={[0, 0, depth * 0.475 + 0.01]}>
          <Box args={[width * 0.55, upperHeight * 0.9, 0.02]}>
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.3} metalness={0.8} roughness={0.1} />
            <Edges color="#ffffff" />
          </Box>
          
          {/* "KRAUSS MAFFEI" Logo Text */}
          <Text
            position={[0, upperHeight * 0.3, 0.02]}
            fontSize={0.25}
            color={logoColor}
            fontWeight="bold"
            anchorX="center"
          >
            KRAUSS MAFFEI
          </Text>
        </group>

        {/* Internal Platens */}
        <Box args={[0.2, upperHeight * 0.8, depth * 0.8]} position={[width * 0.2, 0, 0]}>
          <meshStandardMaterial color="#475569" metalness={0.6} />
        </Box>
        <Box args={[0.2, upperHeight * 0.8, depth * 0.8]} position={[-width * 0.2, 0, 0]}>
          <meshStandardMaterial color="#475569" metalness={0.6} />
        </Box>
        
        {/* Tie Bars */}
        {[1, -1].map(y => [1, -1].map(z => (
          <Cylinder 
            key={`${y}-${z}`}
            args={[0.05, 0.05, width * 0.55]} 
            rotation={[0, 0, Math.PI / 2]} 
            position={[0, y * upperHeight * 0.3, z * depth * 0.3]}
          >
            <meshStandardMaterial color="#f1f5f9" metalness={0.9} />
          </Cylinder>
        )))}
      </group>

      {/* 3. Injection Unit (Right) */}
      <group position={[width * 0.35, baseHeight + upperHeight * 0.4, 0]}>
        {/* Silver Body */}
        <Box args={[width * 0.3, upperHeight * 0.7, depth * 0.7]}>
          <meshStandardMaterial color={silverColor} metalness={0.4} roughness={0.6} />
          <Edges color="#475569" />
        </Box>
        
        {/* Barrel Extension */}
        <Cylinder args={[0.1, 0.1, width * 0.2]} rotation={[0, 0, Math.PI / 2]} position={[width * 0.15, 0, 0]}>
          <meshStandardMaterial color="#334155" metalness={0.8} />
        </Cylinder>
      </group>

      {/* 4. Integrated Control Panel */}
      <group position={[width * 0.15, baseHeight + upperHeight * 0.5, depth * 0.4]}>
        <Box args={[0.4, upperHeight * 0.8, 0.2]}>
          <meshStandardMaterial color="#1e293b" />
          <Edges color="#000000" />
        </Box>
        {/* Screen */}
        <mesh position={[0, upperHeight * 0.15, 0.11]}>
          <planeGeometry args={[0.3, upperHeight * 0.3]} />
          <meshStandardMaterial color="#000000" emissive="#3b82f6" emissiveIntensity={0.5} />
        </mesh>
        {/* Buttons/Keypad */}
        <Box args={[0.3, upperHeight * 0.3, 0.05]} position={[0, -upperHeight * 0.2, 0.11]}>
          <meshStandardMaterial color="#475569" />
        </Box>
      </group>

      {/* Warning Light on Top */}
      <group position={[-width * 0.3, baseHeight + upperHeight, 0]}>
        <Cylinder args={[0.05, 0.05, 0.15]}>
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
        </Cylinder>
      </group>
    </group>
  );
};
