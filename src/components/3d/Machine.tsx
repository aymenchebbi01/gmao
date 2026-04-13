import React, { useRef, useState, useMemo } from 'react';
import { useFrame, ThreeEvent, useThree } from '@react-three/fiber';
import { Box, Text, Edges, Cylinder, Cone, Sphere, useGLTF, Clone } from '@react-three/drei';
import * as THREE from 'three';
import { Machine as MachineType } from '../../types';
import { Boy12AModel } from './Boy12AModel';
import { KraussMaffeiModel } from './KraussMaffeiModel';
import { BattenfeldModel } from './BattenfeldModel';

interface MachineProps {
  machine: MachineType & { position3d: { position: [number, number, number], rotation: [number, number, number] } };
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<MachineType>) => void;
}

const ProceduralMachine: React.FC<{ machine: MachineType, isSelected: boolean, hovered: boolean }> = ({ machine, isSelected, hovered }) => {
  // Approximate dimensions if not provided, though GMAO has some fields
  // In 3D designer, dimensions were props. Here we might need defaults or use machine.type/spec
  const width = 4; // Default width
  const height = 2; // Default height
  const depth = 1.5; // Default depth

  const baseHeight = height * 0.3;
  const unitHeight = height * 0.7;
  const clampWidth = width * 0.45;
  const injectWidth = width * 0.45;

  return (
    <group>
      {/* 1. Heavy Industrial Base */}
      <group position={[0, baseHeight / 2, 0]}>
        <Box args={[width, baseHeight, depth]}>
          <meshStandardMaterial
            color="#1e293b"
            metalness={0.6}
            roughness={0.4}
            emissive={isSelected ? (machine.status === 'down' ? '#ef4444' : '#3b82f6') : hovered ? '#475569' : '#000000'}
            emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0}
          />
          <Edges color="#0f172a" />
        </Box>
      </group>

      {/* 2. Clamping Unit (Left) */}
      <group position={[-width / 2 + clampWidth / 2, baseHeight + unitHeight / 2, 0]}>
        <Box args={[0.5, unitHeight, depth * 0.95]} position={[clampWidth / 2 - 0.25, 0, 0]}>
          <meshStandardMaterial color="#3b82f6" metalness={0.4} roughness={0.6} />
          <Edges color="#0f172a" />
        </Box>
        <Box args={[0.4, unitHeight * 0.9, depth * 0.85]} position={[-0.2, 0, 0]}>
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
          <Edges color="#0f172a" />
        </Box>
        <Box args={[0.5, unitHeight, depth * 0.95]} position={[-clampWidth / 2 + 0.25, 0, 0]}>
          <meshStandardMaterial color="#3b82f6" metalness={0.4} roughness={0.6} />
          <Edges color="#0f172a" />
        </Box>
      </group>

      {/* 3. Injection Unit (Right) */}
      <group position={[width / 2 - injectWidth / 2, baseHeight + unitHeight / 2, 0]}>
        <Cylinder args={[unitHeight * 0.15, unitHeight * 0.15, injectWidth]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
        </Cylinder>
        <group position={[injectWidth * 0.4, 0, 0]}>
          <Box args={[injectWidth * 0.4, unitHeight * 0.6, depth * 0.7]}>
            <meshStandardMaterial color="#3b82f6" metalness={0.4} roughness={0.6} />
            <Edges color="#0f172a" />
          </Box>
        </group>
      </group>
    </group>
  );
};

// Error Boundary for GLTF loading
interface GltfErrorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError: () => void;
}

interface GltfErrorBoundaryState {
  hasError: boolean;
}

class GltfErrorBoundary extends React.Component<GltfErrorBoundaryProps, GltfErrorBoundaryState> {
  constructor(props: GltfErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    console.error("GLTF Load Error:", error);
    Promise.resolve().then(() => { this.props.onError(); });
  }
  componentDidUpdate(prevProps: GltfErrorBoundaryProps) {
    if (this.props.children !== prevProps.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const GltfModel: React.FC<{ url: string, machine: MachineType, isSelected: boolean }> = ({ url, machine, isSelected }) => {
  const gltf = useGLTF(url);
  return (
    <group scale={[0.8, 0.8, 0.8]}>
      <Clone object={gltf.scene} />
      {isSelected && (
        <Box args={[5, 2, 2]} position={[0, 1, 0]}>
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.3} />
        </Box>
      )}
    </group>
  );
};

/** Pick a branded model based on the machine name (case-insensitive substring match) */
const getBrandedModel = (
  machine: MachineType,
  isSelected: boolean,
  hovered: boolean
): React.ReactNode | null => {
  const nameLower = machine.name.toLowerCase();
  if (nameLower.includes('battenfeld')) {
    return <BattenfeldModel machine={machine} isSelected={isSelected} hovered={hovered} />;
  }
  if (nameLower.includes('boy')) {
    return <Boy12AModel machine={machine} isSelected={isSelected} hovered={hovered} />;
  }
  if (nameLower.includes('krauss') || nameLower.includes('kraussmaffei') || nameLower.includes('krauss maffei')) {
    return <KraussMaffeiModel machine={machine} isSelected={isSelected} hovered={hovered} />;
  }
  return null;
};

export const Machine: React.FC<MachineProps> = ({ machine, isSelected, onSelect, onUpdate }) => {
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const intersection = useRef(new THREE.Vector3());
  const { raycaster, mouse, camera } = useThree();

  const pos3d = machine.position3d || { position: [0, 0, 0], rotation: [0, 0, 0] };

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y = THREE.MathUtils.lerp(
        meshRef.current.rotation.y,
        pos3d.rotation[1],
        0.15
      );
      const targetScale = hovered ? 1.02 : 1;
      const s = THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, 0.2);
      meshRef.current.scale.set(s, s, s);
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect(machine.id);
    setDragging(true);
    (e.target as any).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setDragging(false);
    (e.target as any).releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (dragging) {
      e.stopPropagation();
      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(dragPlane.current, intersection.current);
      const x = Math.round(intersection.current.x * 2) / 2;
      const z = Math.round(intersection.current.z * 2) / 2;
      onUpdate(machine.id, {
        position3d: {
          position: [x, pos3d.position[1], z],
          rotation: pos3d.rotation
        }
      });
    }
  };

  const proceduralFallback = <ProceduralMachine machine={machine} isSelected={isSelected} hovered={hovered} />;

  // Determine the 3D body to render: GLTF > branded model > generic procedural
  const brandedModel = getBrandedModel(machine, isSelected, hovered);

  const machineBody = (() => {
    // Priority 1: explicit .glb model file
    if (machine.imageUrl && !loadError && machine.imageUrl.endsWith('.glb')) {
      return (
        <GltfErrorBoundary
          fallback={brandedModel ?? proceduralFallback}
          onError={() => setLoadError(true)}
        >
          <React.Suspense fallback={brandedModel ?? proceduralFallback}>
            <GltfModel url={machine.imageUrl} machine={machine} isSelected={isSelected} />
          </React.Suspense>
        </GltfErrorBoundary>
      );
    }
    // Priority 2: branded procedural model (Battenfeld / Boy 12A / KraussMaffei)
    if (brandedModel) {
      return brandedModel;
    }
    // Priority 3: generic procedural machine
    return proceduralFallback;
  })();

  return (
    <group
      ref={meshRef}
      position={pos3d.position}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {machineBody}

      <Text
        position={[0, 2.8, 0]}
        fontSize={0.35}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {machine.name}
      </Text>

      {/* Status indicator */}
      <Sphere args={[0.15]} position={[0, 3.5, 0]}>
        <meshStandardMaterial
          color={machine.status === 'operational' ? '#22c55e' : machine.status === 'down' ? '#ef4444' : machine.status === 'idle' ? '#8b5cf6' : '#f59e0b'}
          emissive={machine.status === 'operational' ? '#22c55e' : machine.status === 'down' ? '#ef4444' : machine.status === 'idle' ? '#8b5cf6' : '#f59e0b'}
          emissiveIntensity={0.5}
        />
      </Sphere>

      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[3, 3.2, 64]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};
