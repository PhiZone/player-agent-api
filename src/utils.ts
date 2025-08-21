export const truncate = (str: string, length: number = 65) => {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
};
