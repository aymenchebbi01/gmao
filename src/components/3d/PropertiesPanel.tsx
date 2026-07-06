import React from 'react';
import { Machine as MachineType } from '../../types';
import { RotateCcw, Move, Settings2, X, HardDrive, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PropertiesPanelProps {
  selectedMachine: MachineType | null;
  onUpdate: (id: string, updates: Partial<MachineType>) => void;
  onClose: () => void;
  setActiveTab?: (tab: string) => void;
  setHistoryMachineId?: (id: string | null) => void;
  readOnly?: boolean;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
  selectedMachine, 
  onUpdate, 
  onClose,
  setActiveTab,
  setHistoryMachineId,
  readOnly
}) => {
  if (!selectedMachine) return null;

  const pos3d = selectedMachine.position3d || { position: [0, 0, 0], rotation: [0, 0, 0] };

  const handleRotation = () => {
    const newRotation: [number, number, number] = [
      pos3d.rotation[0],
      pos3d.rotation[1] + Math.PI / 2,
      pos3d.rotation[2]
    ];
    onUpdate(selectedMachine.id, { 
      position3d: { 
        ...pos3d, 
        rotation: newRotation 
      } 
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        className="absolute top-4 right-4 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden text-gray-800 z-50"
      >
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <HardDrive className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="font-bold text-sm">Machine Details</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1 block">Machine Information</label>
            <h3 className="text-lg font-semibold leading-tight text-gray-900">{selectedMachine.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                selectedMachine.status === 'operational' ? 'bg-green-100 text-green-700' : 
                selectedMachine.status === 'down' ? 'bg-red-100 text-red-700' : 
                selectedMachine.status === 'idle' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {selectedMachine.status}
              </span>
              <span className="text-xs text-gray-400 font-mono">SN: {selectedMachine.serialNumber}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1 block">Position X</label>
              <div className="bg-gray-50 p-2 rounded-lg font-mono text-sm border border-gray-200 text-gray-600 italic">
                {pos3d.position[0].toFixed(2)}m
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1 block">Position Z</label>
              <div className="bg-gray-50 p-2 rounded-lg font-mono text-sm border border-gray-200 text-gray-600 italic">
                {pos3d.position[2].toFixed(2)}m
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400 block">Actions</label>
            
            {!readOnly && (
              <button 
                onClick={handleRotation}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all text-sm font-medium text-gray-700"
              >
                <RotateCcw className="w-4 h-4" />
                Rotate 90°
              </button>
            )}

            <button 
              onClick={() => {
                if (setHistoryMachineId && setActiveTab) {
                  setHistoryMachineId(selectedMachine.id);
                  setActiveTab('machines');
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all text-sm font-medium shadow-md shadow-blue-200"
            >
              <Info className="w-4 h-4" />
              Machine History
            </button>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
          {readOnly ? (
            <>
              <Info className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] text-gray-400 font-medium">VIEW ONLY MODE — EDITING DISABLED</span>
            </>
          ) : (
            <>
              <Move className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] text-gray-400 font-medium">DRAG MACHINE TO REPOSITION</span>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
