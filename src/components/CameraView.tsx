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
  const lineDashOffsetRef = useRef(0);
  const recognizedLetterRef = useRef<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isASLEnabled, setIsASLEnabled] = useState(false);
  const [isFaceEnabled, setIsFaceEnabled] = useState(false);
  const [isHandEnabled, setIsHandEnabled] = useState(true);
  const [isEyeEnabled, setIsEyeEnabled] = useState(false);
  const [eyeState, setEyeState] = useState('Open');
  const [detectedLetter, setDetectedLetter] = useState<string | null>(null);
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
          numHands: 2
        });
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 1
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

        if (handLandmarker && isHandEnabled) {
          const handResults = handLandmarker.detectForVideo(video, performance.now());
          if (handResults.landmarks && handResults.landmarks.length > 0) {
            
            // Recognize ASL letter
            if (isASLEnabled && handResults.landmarks.length > 0) {
              const handedness = handResults.handedness?.[0]?.[0]?.categoryName;
              const letter = classifyASL(handResults.landmarks[0], handedness);
              setDetectedLetter(prev => prev !== letter ? letter : prev);
            } else {
              setDetectedLetter(null);
            }

            // Draw connections between hands using raw landmarks for canvas
            // Use handResults.landmarks directly if CSS mirroring handles the flip
            const drawingLandmarks = handResults.landmarks;

            if (drawingLandmarks.length >= 2) {
              const hand1 = drawingLandmarks[0];
              const hand2 = drawingLandmarks[1];
              
              // Gesture detection (invariant to x-reflection)
              const isHand1Closed = Math.sqrt(
                Math.pow(hand1[8].x - hand1[4].x, 2) + Math.pow(hand1[8].y - hand1[4].y, 2)
              ) < 0.05;
              const isHand2Closed = Math.sqrt(
                Math.pow(hand2[8].x - hand2[4].x, 2) + Math.pow(hand2[8].y - hand2[4].y, 2)
              ) < 0.05;

              if (isHand1Closed || isHand2Closed) {
                linkedFingersRef.current = [];
              } else {
                if (linkedFingersRef.current.length === 0) {
                  const newLinkedFingers: number[] = [];
                  for (let i = 0; i < 21; i++) {
                    const h1 = hand1[i];
                    const h2 = hand2[i];
                    const dist = Math.sqrt(Math.pow(h1.x - h2.x, 2) + Math.pow(h1.y - h2.y, 2));
                    if (dist < 0.2) {
                      newLinkedFingers.push(i);
                    }
                  }
                  linkedFingersRef.current = newLinkedFingers;
                }
              }

              // Line styling
              ctx!.lineWidth = 10;
              ctx!.lineCap = 'round';
              ctx!.shadowBlur = 20;
              
              lineDashOffsetRef.current = (lineDashOffsetRef.current + 1) % 20;
              ctx!.setLineDash([10, 10]);
              ctx!.lineDashOffset = -lineDashOffsetRef.current;

              const futuristicColors = ['#6366f1', '#a855f7', '#ec4899', '#22d3ee', '#10b981'];

              linkedFingersRef.current.forEach((i, idx) => {
                const h1 = hand1[i];
                const h2 = hand2[i];
                
                const x1 = h1.x * canvas.width;
                const y1 = h1.y * canvas.height;
                const x2 = h2.x * canvas.width;
                const y2 = h2.y * canvas.height;
                
                ctx!.beginPath();
                ctx!.strokeStyle = futuristicColors[idx % futuristicColors.length];
                ctx!.shadowColor = ctx!.strokeStyle;
                ctx!.moveTo(x1, y1);
                ctx!.lineTo(x2, y2);
                ctx!.stroke();
              });
              
              ctx!.setLineDash([]); // Reset dash for subsequent drawing
              ctx!.shadowBlur = 0; // Reset shadow blur
              ctx!.shadowColor = 'transparent'; // Reset shadow color
            } else {
              linkedFingersRef.current = [];
            }

            for (const landmarks of drawingLandmarks) {
              drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                color: '#00FF00',
                lineWidth: 2
              });
              drawingUtils.drawLandmarks(landmarks, {
                color: '#FF0000',
                lineWidth: 1,
                radius: 3
              });
            }
          }
        }

        if (faceLandmarker && (isFaceEnabled || isEyeEnabled)) {
          const faceResults = faceLandmarker.detectForVideo(video, performance.now());
          if (faceResults.faceLandmarks) {
            for (const landmarks of faceResults.faceLandmarks) {
              if (isFaceEnabled) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                  color: '#C0C0C070',
                  lineWidth: 1
                });
              }

                // Eye tracking
                if (isEyeEnabled) {
                  const leftEyeIndices = [33, 160, 158, 133, 153, 144];
                  const rightEyeIndices = [263, 387, 385, 362, 380, 373];
                  
                  // Helper to draw eye box
                  const drawEyeBox = (eyeIndices: number[]) => {
                    const eyePoints = eyeIndices.map(i => landmarks[i]);
                    const minX = Math.min(...eyePoints.map(p => p.x)) * canvas.width;
                    const maxX = Math.max(...eyePoints.map(p => p.x)) * canvas.width;
                    const minY = Math.min(...eyePoints.map(p => p.y)) * canvas.height;
                    const maxY = Math.max(...eyePoints.map(p => p.y)) * canvas.height;
                    ctx!.strokeStyle = 'cyan';
                    ctx!.lineWidth = 2;
                    ctx!.strokeRect(minX - 5, minY - 5, (maxX - minX) + 10, (maxY - minY) + 10);
                  };
                  
                  drawEyeBox(leftEyeIndices);
                  drawEyeBox(rightEyeIndices);

                  const leftEAR = getEAR(landmarks, leftEyeIndices);
                  const rightEAR = getEAR(landmarks, rightEyeIndices);
                  const avgEAR = (leftEAR + rightEAR) / 2;

                  if (avgEAR < 0.2) {
                    closedFramesRef.current++;
                  } else {
                    closedFramesRef.current = 0;
                    setEyeState(prev => prev !== 'Open' ? 'Open' : prev);
                  }

                  if (closedFramesRef.current > 90) { // 3 seconds at 30fps
                    setEyeState(prev => prev !== 'Sleeping' ? 'Sleeping' : prev);
                  } else if (closedFramesRef.current > 0) {
                    setEyeState(prev => prev !== 'Closed' ? 'Closed' : prev);
                  }
                }
            }
          }
        }
        
        // Draw eye state
        if (isEyeEnabled) {
          ctx!.font = '24px Arial';
          ctx!.fillStyle = 'yellow';
          ctx!.fillText(`Eye State: ${eyeState}`, 50, 100);
        }
      }
      animationFrameId = requestAnimationFrame(predict);
    }

    predict();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [handLandmarker, faceLandmarker, isMirrored, isASLEnabled, isHandEnabled, isFaceEnabled, isEyeEnabled]);

  return (
    <div className="relative w-full h-screen bg-black">
      {isASLEnabled && detectedLetter && (
        <div className="absolute top-6 left-6 z-10 bg-black/60 backdrop-blur-md rounded-2xl p-6 border border-white/10 text-white flex items-center gap-4 shadow-2xl">
          <span className="text-sm font-medium tracking-wide uppercase text-white/70">Detected</span>
          <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-cyan-400">
            {detectedLetter}
          </span>
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
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 items-end">
        <button 
          onClick={() => setIsMirrored(!isMirrored)}
          className="px-4 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700"
        >
          {isMirrored ? 'Unmirror Camera' : 'Mirror Camera'}
        </button>
        <button 
          onClick={() => setIsHandEnabled(!isHandEnabled)}
          className={`px-4 py-2 text-white rounded-full ${isHandEnabled ? 'bg-blue-600' : 'bg-gray-800'} hover:bg-opacity-80`}
        >
          {isHandEnabled ? 'Hand Enabled' : 'Hand Disabled'}
        </button>
        <button 
          onClick={() => setIsASLEnabled(!isASLEnabled)}
          className={`px-4 py-2 text-white rounded-full ${isASLEnabled ? 'bg-green-600' : 'bg-gray-800'} hover:bg-opacity-80`}
        >
          {isASLEnabled ? 'ASL Enabled' : 'ASL Disabled'}
        </button>
        <button 
          onClick={() => setIsFaceEnabled(!isFaceEnabled)}
          className={`px-4 py-2 text-white rounded-full ${isFaceEnabled ? 'bg-yellow-600' : 'bg-gray-800'} hover:bg-opacity-80`}
        >
          {isFaceEnabled ? 'Face Enabled' : 'Face Disabled'}
        </button>
        <button 
          onClick={() => setIsEyeEnabled(!isEyeEnabled)}
          className={`px-4 py-2 text-white rounded-full ${isEyeEnabled ? 'bg-orange-600' : 'bg-gray-800'} hover:bg-opacity-80`}
        >
          {isEyeEnabled ? 'Eye Enabled' : 'Eye Disabled'}
        </button>
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
