import React, { useState, useEffect, useCallback, Suspense } from 'react';

const SITES = ['Site A', 'Site C'] as const;
type SiteName = typeof SITES[number];
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Sky } from '@react-three/drei';
import { FactoryFloor } from './3d/FactoryFloor';
import { Machine } from './3d/Machine';
import { PropertiesPanel } from './3d/PropertiesPanel';
import { Machine as MachineType } from '../types';
import { api } from '../services/api';
import { Loader2, Box, Save, RefreshCw, Building2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

class CanvasErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error('3D Canvas Error:', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 bg-gray-50">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
          <h2 className="text-xl font-bold text-gray-800">3D View Failed to Load</h2>
          <p className="text-sm text-gray-500 max-w-xs text-center">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface FactoryLayoutProps {
  setActiveTab?: (tab: string) => void;
  setHistoryMachineId?: (id: string | null) => void;
}

export default function FactoryLayout({ setActiveTab, setHistoryMachineId }: FactoryLayoutProps) {
  const { user } = useAuth();
  const readOnly = user?.role === 'technician';

  const [machines, setMachines] = useState<MachineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteName>('Site A');

  useEffect(() => {
    fetchMachines();
  }, []);

  const fetchMachines = async () => {
    try {
      setLoading(true);
      const data = await api.getMachines();
      setMachines(data);
    } catch (error) {
      console.error('Error fetching machines:', error);
      toast.error('Failed to load machine layout');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMachine = useCallback((id: string, updates: Partial<MachineType>) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
    setHasChanges(true);
  }, []);

  const handleSaveLayout = async () => {
    try {
      toast.info('Saving factory layout...');
      const promises = machines.map(m => {
        if (m.position3d) {
          return api.updateMachine(m.id, { position3d: m.position3d });
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
      setHasChanges(false);
      toast.success('Layout saved successfully');
    } catch (error) {
      console.error('Error saving layout:', error);
      toast.error('Failed to save layout');
    }
  };

  const siteMachines = machines.filter((m) => m.location === selectedSite);
  const selectedMachine = siteMachines.find((m) => m.id === selectedId) || null;

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-gray-500 font-medium">Loading 3D Factory Layout...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] relative rounded-3xl overflow-hidden border border-gray-200 bg-gray-50 shadow-inner">
      {/* Controls Overlay */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-3 flex-wrap">
        {/* Site Switcher */}
        <div className="flex bg-white/80 backdrop-blur-md border border-gray-200 rounded-2xl p-1 shadow-lg gap-1">
          <Building2 className="w-5 h-5 text-gray-400 self-center ml-2 mr-1" />
          {SITES.map((site) => (
            <button
              key={site}
              onClick={() => { setSelectedSite(site); setSelectedId(null); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedSite === site
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'text-gray-500 hover:bg-gray-100'
                }`}
            >
              {site}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex bg-white/80 backdrop-blur-md border border-gray-200 rounded-2xl p-1 shadow-lg">
          <button
            onClick={fetchMachines}
            className="p-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Refresh Layout"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {!readOnly && (
            <button
              onClick={handleSaveLayout}
              disabled={!hasChanges}
              className={`p-3 rounded-xl transition-all flex items-center gap-2 ${hasChanges
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                : 'text-gray-300 cursor-not-allowed'
                }`}
              title="Save Layout"
            >
              <Save className="w-5 h-5" />
              {hasChanges && <span className="text-xs font-bold pr-1">SAVE</span>}
            </button>
          )}
        </div>

        <div className="px-4 py-3 bg-white/80 backdrop-blur-md border border-gray-200 rounded-2xl shadow-lg">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Machines: <span className="text-blue-600">{siteMachines.length}</span>
          </span>
        </div>
      </div>

      {/* 3D Canvas */}
      <CanvasErrorBoundary>
        <div className="absolute inset-0" onContextMenu={(e) => e.preventDefault()}>
          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[15, 15, 15]} fov={50} />
            <OrbitControls
              makeDefault
              enabled={!selectedId}
              minPolarAngle={0}
              maxPolarAngle={Math.PI / 2.1}
            />

            <ambientLight intensity={0.7} />
            <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#444444" />

            <directionalLight
              position={[50, 50, 50]}
              intensity={1.2}
              castShadow
              shadow-mapSize={[2048, 2048]}
            />

            <Suspense fallback={null}>
              <color attach="background" args={['#f8fafc']} />
              <Sky distance={450000} sunPosition={[5, 1, 8]} inclination={0} azimuth={0.25} />
              <FactoryFloor />
              {siteMachines.map((machine) => (
                <Machine
                  key={machine.id}
                  machine={machine as any}
                  isSelected={selectedId === machine.id}
                  onSelect={setSelectedId}
                  onUpdate={handleUpdateMachine}
                  readOnly={readOnly}
                />
              ))}
              <ContactShadows
                position={[0, 0, 0]}
                opacity={0.4}
                scale={100}
                blur={2}
                far={4.5}
              />
            </Suspense>
          </Canvas>
        </div>
      </CanvasErrorBoundary>

      <PropertiesPanel
        selectedMachine={selectedMachine}
        onUpdate={handleUpdateMachine}
        onClose={() => setSelectedId(null)}
        setActiveTab={setActiveTab}
        setHistoryMachineId={setHistoryMachineId}
        readOnly={readOnly}
      />
    </div>
  );
}
