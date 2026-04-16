import {useEffect, useRef, useState} from 'react';
import {FilesetResolver, HandLandmarker, DrawingUtils} from '@mediapipe/tasks-vision';
import { classifyASL } from '../lib/aslClassifier';

export default function CameraView({onHome}: {onHome: () => void}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const [linkedFingers, setLinkedFingers] = useState<number[]>([]);
  const recognizedLetterRef = useRef<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

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
        if (isMounted) {
          setHandLandmarker(landmarker);
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
        const results = handLandmarker!.detectForVideo(video, performance.now());

        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        const drawingUtils = new DrawingUtils(ctx!);

        if (results.landmarks) {
          // Mirror all landmarks first
          const mirroredLandmarksList = isMirrored
            ? results.landmarks.map(hand => hand.map(lm => ({...lm, x: 1 - lm.x})))
            : results.landmarks;

          // Recognize ASL letter from the first hand
          if (mirroredLandmarksList.length > 0) {
            recognizedLetterRef.current = classifyASL(mirroredLandmarksList[0]);
          } else {
            recognizedLetterRef.current = null;
          }

          // Draw recognized letter
          if (recognizedLetterRef.current) {
            ctx!.font = '48px Arial';
            ctx!.fillStyle = 'white';
            ctx!.fillText(`Letter: ${recognizedLetterRef.current}`, 50, 50);
          }

          // Draw connections between hands
          if (mirroredLandmarksList.length >= 2) {
            const hand1 = mirroredLandmarksList[0];
            const hand2 = mirroredLandmarksList[1];
            
            // Gesture detection for closing hands
            const isHand1Closed = Math.sqrt(
              Math.pow(hand1[8].x - hand1[4].x, 2) + Math.pow(hand1[8].y - hand1[4].y, 2)
            ) < 0.05;
            const isHand2Closed = Math.sqrt(
              Math.pow(hand2[8].x - hand2[4].x, 2) + Math.pow(hand2[8].y - hand2[4].y, 2)
            ) < 0.05;

            if (isHand1Closed || isHand2Closed) {
              setLinkedFingers([]);
            } else {
              // Update linked fingers if not already linked
              if (linkedFingers.length === 0) {
                const newLinkedFingers: number[] = [];
                for (let i = 0; i < 21; i++) {
                  const h1 = hand1[i];
                  const h2 = hand2[i];
                  const dist = Math.sqrt(Math.pow(h1.x - h2.x, 2) + Math.pow(h1.y - h2.y, 2));
                  if (dist < 0.2) {
                    newLinkedFingers.push(i);
                  }
                }
                setLinkedFingers(newLinkedFingers);
              }
            }

            ctx!.lineWidth = 4;
            linkedFingers.forEach(i => {
              const h1 = hand1[i];
              const h2 = hand2[i];
              
              const x1 = h1.x * canvas.width;
              const y1 = h1.y * canvas.height;
              const x2 = h2.x * canvas.width;
              const y2 = h2.y * canvas.height;
              
              ctx!.beginPath();
              ctx!.strokeStyle = `hsl(${(i * 20) % 360}, 100%, 50%)`;
              ctx!.moveTo(x1, y1);
              ctx!.lineTo(x2, y2);
              ctx!.stroke();
            });
          } else {
            setLinkedFingers([]);
          }

          for (const landmarks of mirroredLandmarksList) {
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
      animationFrameId = requestAnimationFrame(predict);
    }

    predict();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [handLandmarker, isMirrored, linkedFingers]);

  return (
    <div className="relative w-full h-screen bg-black">
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
      <button 
        onClick={() => setIsMirrored(!isMirrored)}
        className="absolute top-4 right-4 z-20 px-4 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700"
      >
        {isMirrored ? 'Unmirror Camera' : 'Mirror Camera'}
      </button>
      <button 
        onClick={onHome}
        className="absolute top-4 left-4 z-20 px-4 py-2 bg-gray-800 text-white rounded-full hover:bg-gray-700"
      >
        Home
      </button>
    </div>
  );
}
