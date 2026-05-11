export type LayoutExpression = {
    type: 'literal';
    value: number;
} | {
    type: 'percentage';
    value: number;
} | {
    type: 'binary';
    operator: '+' | '-';
    left: LayoutExpression;
    right: LayoutExpression;
};
export declare function parsePosition(value: number | string): LayoutExpression;
export declare function evaluateLayoutExpression(expression: LayoutExpression, extent: number): number;
export declare function getPosition(expression: LayoutExpression, extent: number): number;
//# sourceMappingURL=positions.d.ts.map