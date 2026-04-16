/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useState} from 'react';
import CameraView from './components/CameraView';
import {motion} from 'motion/react';

type AppMode = 'idle' | 'selecting' | 'hand-tracking';

export default function App() {
  const [mode, setMode] = useState<AppMode>('idle');

  return (
    <main className="min-h-screen bg-black text-white font-sans overflow-hidden">
      {mode === 'idle' && (
        <div className="relative flex flex-col items-center justify-center min-h-screen p-6 text-center">
          {/* Epic Background Art */}
          <div className="absolute inset-0 z-0 opacity-20">
            <img
              src="https://picsum.photos/seed/vision/1920/1080?blur=10"
              alt="Computer Vision Abstract"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black" />
          </div>

          <motion.div className="relative z-10">
            <motion.h1 
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              className="text-7xl md:text-8xl font-bold tracking-tighter mb-6 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent"
            >
              Vision Engine
            </motion.h1>
            <motion.p 
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: 0.2}}
              className="text-xl md:text-2xl text-gray-300 mb-12 max-w-2xl"
            >
              Advanced computer vision and gesture recognition, engineered for the next generation of human-machine interaction.
            </motion.p>
            <motion.button
              initial={{opacity: 0, scale: 0.9}}
              animate={{opacity: 1, scale: 1}}
              transition={{delay: 0.4}}
              onClick={() => setMode('selecting')}
              className="px-10 py-5 bg-white text-black font-bold text-lg rounded-full hover:bg-cyan-400 transition-all hover:scale-105 shadow-[0_0_20px_rgba(34,211,238,0.5)]"
            >
              Explore Interface
            </motion.button>
          </motion.div>
        </div>
      )}

      {mode === 'selecting' && (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <motion.h2 
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            className="text-4xl font-bold mb-12"
          >
            Select Your Mode
          </motion.h2>
          <motion.button
            initial={{opacity: 0, scale: 0.9}}
            animate={{opacity: 1, scale: 1}}
            onClick={() => setMode('hand-tracking')}
            className="px-8 py-4 bg-gray-900 border border-cyan-500 text-white font-semibold rounded-xl hover:bg-cyan-900 transition-colors mb-4"
          >
            Hand Gesture Recognition & Tracking
          </motion.button>
        </div>
      )}

      {mode === 'hand-tracking' && (
        <CameraView onHome={() => setMode('idle')} />
      )}
    </main>
  );
}
