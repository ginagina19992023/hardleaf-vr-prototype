// A rigid 1:1 placement: the model's floor pivot lands exactly on the XR floor hit.
export function placementOffset(pivot,anchor,yaw){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return {x:anchor.x-c*pivot.x-s*pivot.z,y:anchor.y-pivot.y,z:anchor.z+s*pivot.x-c*pivot.z};
}
