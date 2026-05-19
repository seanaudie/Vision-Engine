import {useEffect, useRef, useState} from 'react';
import {FilesetResolver, HandLandmarker, FaceLandmarker, DrawingUtils} from '@mediapipe/tasks-vision';
import { classifyASL } from '../lib/aslClassifier';

export default function CameraView({onHome}: {onHome: () => void}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const linkedFingersRef = useRef<number[]>([]);
  const recognizedLetterRef = useRef<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isASLEnabled, setIsASLEnabled] = useState(false);
  const [isFaceEnabled, setIsFaceEnabled] = useState(false);
  const [isHandEnabled, setIsHandEnabled] = useState(true);
  const [isEyeEnabled, setIsEyeEnabled] = useState(false);
  const [eyeState, setEyeState] = useState('Open');
  const [detectedLetter, setDetectedLetter] = useState<string | null>(null);
  const [detectedFaceStates, setDetectedFaceStates] = useState<any[]>([]);
  const closedFramesRef = useRef(0);

  // Helper to calculate Euclidean distance
  const getDistance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => 
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  // Helper to calculate Eye Aspect Ratio (EAR)
  const getEAR = (landmarks: any[], eyeIndices: number[]) => {
    const [p1, p2, p3, p4, p5, p6] = eyeIndices.map(i => landmarks[i]);
    const vertical1 = getDistance(p2, p6);
    const vertical2 = getDistance(p3, p5);
    const horizontal = getDistance(p1, p4);
    return (vertical1 + vertical2) / (2 * horizontal);
  };

  // ... (setup code remains same)

  // ... (setup code remains same)

  // ... (setup code remains same)

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;
    let animationFrameId: number;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({video: true});
        if (isMounted && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        if (isMounted) {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            setCameraError("Camera permission denied. Please allow camera access to use this feature.");
          } else {
            setCameraError("Camera error: " + (err instanceof Error ? err.message : String(err)));
          }
        }
      }
    }

    async function setupMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 4
        });
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 4
        });
        if (isMounted) {
          setHandLandmarker(landmarker);
          setFaceLandmarker(faceLandmarker);
        }
      } catch (err) {
        console.error("MediaPipe error:", err);
      }
    }

    setupCamera();
    setupMediaPipe();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    if (!handLandmarker || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastVideoTime = -1;
    let animationFrameId: number;

    function predict() {
      if (video.readyState < 2) {
        animationFrameId = requestAnimationFrame(predict);
        return;
      }
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        const drawingUtils = new DrawingUtils(ctx!);

        // 1. Hand Detection
        if (handLandmarker && isHandEnabled) {
          const handResults = handLandmarker.detectForVideo(video, performance.now());
          if (handResults.landmarks?.length > 0) {
            if (isASLEnabled) {
              const letters = handResults.landmarks.map((landmarks, index) => {
                const handedness = handResults.handedness?.[index]?.[0]?.categoryName;
                return classifyASL(landmarks, handedness);
              }).filter(l => l !== null).join(', ');
              setDetectedLetter(prev => prev !== letters ? (letters || null) : prev);
            } else {
              setDetectedLetter(null);
            }

            // Draw Hand Connections
            if (handResults.landmarks.length >= 2) {
              const hand1 = handResults.landmarks[0];
              const hand2 = handResults.landmarks[1];
              
              const isHand1Closed = Math.sqrt(Math.pow(hand1[8].x - hand1[4].x, 2) + Math.pow(hand1[8].y - hand1[4].y, 2)) < 0.05;
              const isHand2Closed = Math.sqrt(Math.pow(hand2[8].x - hand2[4].x, 2) + Math.pow(hand2[8].y - hand2[4].y, 2)) < 0.05;

              if (isHand1Closed || isHand2Closed) {
                linkedFingersRef.current = [];
              } else if (linkedFingersRef.current.length === 0) {
                const newLinkedFingers: number[] = [];
                for (let i = 0; i < 21; i++) {
                  const dist = Math.sqrt(Math.pow(hand1[i].x - hand2[i].x, 2) + Math.pow(hand1[i].y - hand2[i].y, 2));
                  if (dist < 0.2) newLinkedFingers.push(i);
                }
                linkedFingersRef.current = newLinkedFingers;
              }

              ctx!.lineWidth = 8;
              ctx!.lineCap = 'round';
              ctx!.shadowBlur = 15;
              ctx!.shadowColor = '#ffffff';
              const time = Date.now() / 150;
              linkedFingersRef.current.forEach((i, idx) => {
                const h1 = hand1[i];
                const h2 = hand2[i];
                const gradient = ctx!.createLinearGradient(h1.x * canvas.width, h1.y * canvas.height, h2.x * canvas.width, h2.y * canvas.height);
                const offset = (Math.sin(time + idx) + 1) / 2;
                gradient.addColorStop(0, '#9ca3af');
                gradient.addColorStop(offset, '#ffffff');
                gradient.addColorStop(1, '#9ca3af');
                ctx!.beginPath();
                ctx!.strokeStyle = gradient;
                ctx!.moveTo(h1.x * canvas.width, h1.y * canvas.height);
                ctx!.lineTo(h2.x * canvas.width, h2.y * canvas.height);
                ctx!.stroke();
              });
              ctx!.shadowBlur = 0;
            }

            handResults.landmarks.forEach(landmarks => {
              drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {color: '#9ca3af', lineWidth: 4});
              drawingUtils.drawLandmarks(landmarks, {color: '#ffffff', lineWidth: 2, radius: 4});
            });
          } else {
            linkedFingersRef.current = [];
          }
        }

        // 2. Face/Eye Detection
        if (faceLandmarker && (isFaceEnabled || isEyeEnabled)) {
          const faceResults = faceLandmarker.detectForVideo(video, performance.now());
          if (faceResults.faceLandmarks) {
            faceResults.faceLandmarks.forEach(landmarks => {
              if (isFaceEnabled) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {color: '#ffffff20', lineWidth: 0.5});
              }
              if (isEyeEnabled) {
                [ [33, 160, 158, 133, 153, 144], [263, 387, 385, 362, 380, 373] ].forEach(eye => {
                  const pts = eye.map(i => landmarks[i]);
                  ctx!.strokeStyle = '#22d3ee';
                  ctx!.lineWidth = 2;
                  ctx!.strokeRect(Math.min(...pts.map(p => p.x)) * canvas.width - 5, Math.min(...pts.map(p => p.y)) * canvas.height - 5, (Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x))) * canvas.width + 10, (Math.max(...pts.map(p => p.y)) - Math.min(...pts.map(p => p.y))) * canvas.height + 10);
                });
              }
            });

            // Mood & Eye State
            setDetectedFaceStates(faceResults.faceLandmarks.map((landmarks) => {
              const leftEAR = getEAR(landmarks, [33, 160, 158, 133, 153, 144]);
              const rightEAR = getEAR(landmarks, [263, 387, 385, 362, 380, 373]);
              const avgEAR = (leftEAR + rightEAR) / 2;
              
              const faceHeight = Math.abs(landmarks[10].y - landmarks[152].y);
              const mouthTop = landmarks[13];
              const mouthBottom = landmarks[14];
              const mouthLeft = landmarks[61];
              const mouthRight = landmarks[291];
              const mouthVerticalOpening = Math.abs(mouthBottom.y - mouthTop.y);
              const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);
              
              const mouthSmile = ((mouthLeft.y + mouthRight.y) / 2 - mouthTop.y) / faceHeight;
              
              let mood = 'Normal';
              if (avgEAR < 0.20 && mouthSmile > 0.01) mood = 'Crying';                
              else if (mouthSmile < -0.02 && (mouthVerticalOpening / mouthWidth) > 0.4) mood = 'Excited';
              else if ((mouthVerticalOpening / mouthWidth) > 0.5 && avgEAR > 0.3) mood = 'Shocked';
              else if (mouthSmile < -0.01) mood = 'Happy';
              else if (mouthSmile > 0.02) mood = 'Sad';
              
              return { 
                mood: isFaceEnabled ? (avgEAR < 0.18 ? 'Crying' : mood) : 'N/A', 
                eyeState: avgEAR < 0.23 ? 'Closed' : 'Open' 
              };
            }));
          } else {
             setDetectedFaceStates([]);
          }
        }
      }
      animationFrameId = requestAnimationFrame(predict);
    }

    predict();
    return () => cancelAnimationFrame(animationFrameId);
  }, [handLandmarker, faceLandmarker, isMirrored, isASLEnabled, isHandEnabled, isFaceEnabled, isEyeEnabled]);

  return (
    <div className="relative w-full h-screen bg-black">
      {( (isASLEnabled && detectedLetter) || ((isFaceEnabled || isEyeEnabled) && detectedFaceStates.length > 0) ) && (
        <div className="absolute top-6 left-6 z-10 bg-black/60 backdrop-blur-md rounded-2xl p-6 border border-white/10 text-white flex flex-col gap-2 shadow-2xl">
          {isASLEnabled && detectedLetter && (
             <div className='flex items-center gap-4'>
               <span className="text-sm font-medium tracking-wide uppercase text-white/70">Detected</span>
               <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-cyan-400">
                 {detectedLetter}
               </span>
             </div>
          )}
          {(isFaceEnabled || isEyeEnabled) && detectedFaceStates.length > 0 && (
            <div className={`pt-2 border-t border-white/10 text-sm md:text-lg ${isASLEnabled && detectedLetter ? '' : 'border-t-0 pt-0'}`}>
              {detectedFaceStates.map((state, i) => state && (
                <div key={i} className="flex flex-col gap-0.5">
                  {isFaceEnabled && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Face {i + 1}</span>
                        <span className="font-semibold tracking-wide text-white/90">{state.mood}</span>
                    </div>
                  )}
                  {isEyeEnabled && <span className="text-xs text-white/60 ml-8">{state.eyeState}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <video 
        ref={videoRef} 
        className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`} 
        autoPlay 
        playsInline 
        muted 
      />
      <canvas 
        ref={canvasRef} 
        className={`absolute top-0 left-0 w-full h-full ${isMirrored ? 'scale-x-[-1]' : ''}`} 
        width={1280} 
        height={720} 
      />
      {cameraError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 text-center text-red-500">
          <p className="text-xl font-bold">{cameraError}</p>
        </div>
      )}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-3">
        {[
          { label: isMirrored ? 'Unmirror Camera' : 'Mirror Camera', action: () => setIsMirrored(!isMirrored), active: true, color: 'bg-slate-700' },
          { label: isHandEnabled ? 'Hand Enabled' : 'Hand Disabled', action: () => setIsHandEnabled(!isHandEnabled), active: isHandEnabled, color: 'bg-blue-600' },
          { label: isASLEnabled ? 'ASL Enabled' : 'ASL Disabled', action: () => setIsASLEnabled(!isASLEnabled), active: isASLEnabled, color: 'bg-green-600' },
          { label: isFaceEnabled ? 'Face Enabled' : 'Face Disabled', action: () => setIsFaceEnabled(!isFaceEnabled), active: isFaceEnabled, color: 'bg-yellow-600' },
          { label: isEyeEnabled ? 'Eye Enabled' : 'Eye Disabled', action: () => setIsEyeEnabled(!isEyeEnabled), active: isEyeEnabled, color: 'bg-orange-600' },
        ].map((btn, i) => (
          <button key={i} onClick={btn.action} className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 backdrop-blur-md shadow-lg ${btn.active ? btn.color : 'bg-black/40 hover:bg-black/60 border border-white/10'}`}>
            {btn.label}
          </button>
        ))}
      </div>
      <button 
        onClick={onHome}
        className="absolute top-4 left-4 z-20 px-4 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700"
      >
        Home
      </button>
    </div>
  );
}
