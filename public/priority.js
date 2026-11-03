// Zero means no rank. Positive priorities come first, starting with 1.
export const priorityRank=value=>Number(value)>0?Number(value):Infinity;
