import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Experience } from './Experience';

export function MountBookViewer(containerElement, initialOptions = {}) {
  const root = createRoot(containerElement);

  // A small wrapper component that holds your options in state
  const BookWrapper = forwardRef(({ initial }, ref) => {
    const [opts, setOpts] = useState(initial);

    // Expose updateBook() and unmount() methods to the outside
    useImperativeHandle(ref, () => ({
      updateBook: (newOpts) =>
        setOpts(prev => ({ ...prev, ...newOpts })),
      unmount: () =>
        root.unmount(),
    }), []);

    return (
      <Canvas>
        <Experience {...opts} />
      </Canvas>
    );
  });

  // Create the ref that we'll call imperatively
  const handleRef = React.createRef();

  // Mount once
  root.render(
    <BookWrapper ref={handleRef} initial={initialOptions} />
  );

  // Return the minimal imperative API
  return {
    updateBook: (newOpts) =>
      handleRef.current && handleRef.current.updateBook(newOpts),
    unmount: () =>
      handleRef.current && handleRef.current.unmount(),
  };
}
