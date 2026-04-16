import { Landmark } from '@mediapipe/tasks-vision';

export function classifyASL(landmarks: Landmark[]): string | null {
  // Landmarks indices:
  // 0: wrist, 1: thumb_cmc, 2: thumb_mcp, 3: thumb_ip, 4: thumb_tip
  // 5: index_mcp, 6: index_pip, 7: index_dip, 8: index_tip
  // 9: middle_mcp, 10: middle_pip, 11: middle_dip, 12: middle_tip
  // 13: ring_mcp, 14: ring_pip, 15: ring_dip, 16: ring_tip
  // 17: pinky_mcp, 18: pinky_pip, 19: pinky_dip, 20: pinky_tip

  const isFingerExtended = (tip: Landmark, pip: Landmark, mcp: Landmark, wrist: Landmark) => {
    // Simple heuristic: distance from wrist to tip > distance from wrist to mcp
    const distTip = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
    const distMcp = Math.sqrt(Math.pow(mcp.x - wrist.x, 2) + Math.pow(mcp.y - wrist.y, 2));
    return distTip > distMcp;
  };

  const indexExtended = isFingerExtended(landmarks[8], landmarks[6], landmarks[5], landmarks[0]);
  const middleExtended = isFingerExtended(landmarks[12], landmarks[10], landmarks[9], landmarks[0]);
  const ringExtended = isFingerExtended(landmarks[16], landmarks[14], landmarks[13], landmarks[0]);
  const pinkyExtended = isFingerExtended(landmarks[20], landmarks[18], landmarks[17], landmarks[0]);

  // A: Fist (thumb tucked, fingers curled)
  if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'A';
  }

  // B: Flat hand (fingers extended, thumb tucked)
  if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return 'B';
  }

  // D: Index finger up, others curled
  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return 'D';
  }

  return null;
}
