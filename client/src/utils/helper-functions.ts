export const VhToPx = (vhValue: number) => {
  const viewportHeightInPx = window.innerHeight;
  // Calculate the value in pixels
  const pxValue = (vhValue * viewportHeightInPx) / 100;
  return pxValue;
};
