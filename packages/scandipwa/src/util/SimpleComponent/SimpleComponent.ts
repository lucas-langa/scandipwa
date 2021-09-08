import React from 'react';

export class SimpleComponent<P = Record<string, unknown>> {
    constructor(props: P) {
        this.props = props;
    }

    readonly props: Readonly<P> & Readonly<{ children?: React.ReactNode }>;

    render(): JSX.Element | null {
        throw new Error('Implement me!');
    }
}