import type { BufferAttributeLayout } from '@luma.gl/core';
import type { TypedArrayConstructor } from "../../types/types.js";
import type { BufferAccessor, DataColumnSettings, LogicalDataType } from "./data-column.js";
export declare function typedArrayFromDataType(type: LogicalDataType): TypedArrayConstructor;
export declare const dataTypeFromTypedArray: (arrayOrType: import("@luma.gl/core").TypedArray | import("@luma.gl/core").TypedArrayConstructor) => import("@luma.gl/core").SignedDataType;
export declare function getBufferAttributeLayout(name: string, accessor: BufferAccessor, deviceType: 'webgpu' | 'wegbgl' | string): BufferAttributeLayout | null;
export declare function getStride(accessor: DataColumnSettings<unknown>): number;
export declare function bufferLayoutEqual(accessor1: DataColumnSettings<unknown>, accessor2: DataColumnSettings<unknown>): boolean;
//# sourceMappingURL=gl-utils.d.ts.map