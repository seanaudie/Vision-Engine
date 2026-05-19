import { Landmark } from '@mediapipe/tasks-vision';

export function classifyASL(landmarks: Landmark[], handedness: string | undefined): string | null {
  // Landmarks indices:
  // 0: wrist, 1: thumb_cmc, 2: thumb_mcp, 3: thumb_ip, 4: thumb_tip
  // 5: index_mcp, 6: index_pip, 7: index_dip, 8: index_tip
  // 9: middle_mcp, 10: middle_pip, 11: middle_dip, 12: middle_tip
  // 13: ring_mcp, 14: ring_pip, 15: ring_dip, 16: ring_tip
  // 17: pinky_mcp, 18: pinky_pip, 19: pinky_dip, 20: pinky_tip

  // Normalize landmarks to always be "Right-like"
  const normalizedLandmarks = handedness === 'Left' 
    ? landmarks.map(lm => ({...lm, x: 1 - lm.x}))                
    : landmarks;

  const isFingerExtended = (tip: Landmark, mcp: Landmark, wrist: Landmark) => {
    // Simple heuristic: distance from wrist to tip > distance from wrist to mcp
    const distTip = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
    const distMcp = Math.sqrt(Math.pow(mcp.x - wrist.x, 2) + Math.pow(mcp.y - wrist.y, 2));
    return distTip > distMcp;
  };

  // Thumb extension (use distance from MCP)
  const isThumbExtended = isFingerExtended(normalizedLandmarks[4], normalizedLandmarks[2], normalizedLandmarks[0]);

  const indexExtended = isFingerExtended(normalizedLandmarks[8], normalizedLandmarks[5], normalizedLandmarks[0]);
  const middleExtended = isFingerExtended(normalizedLandmarks[12], normalizedLandmarks[9], normalizedLandmarks[0]);
  const ringExtended = isFingerExtended(normalizedLandmarks[16], normalizedLandmarks[13], normalizedLandmarks[0]);
  const pinkyExtended = isFingerExtended(normalizedLandmarks[20], normalizedLandmarks[17], normalizedLandmarks[0]);

  // A: Fist (thumb tucked, fingers curled - also check for thumb)
  if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'A';
  }

  // B: Flat hand (fingers extended)
  if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return 'B';
  }

  // D: Index finger up, others curled
  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'D';
  }
  
  // V: Index & middle up
  if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      return 'V';
  }

  return null;
}
