// Bundle Monaco locally (instead of loading it from a CDN) so that the editor
// and the y-monaco binding use exactly the same Monaco instance.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
  },
};
loader.config({ monaco });
