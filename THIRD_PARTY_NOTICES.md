# Third-party notices

The application source is licensed under MIT. The following AI assets and runtime are not relicensed by this repository.

## Models downloaded at runtime

- onnx-community/BEN2-ONNX — MIT. Model card: https://huggingface.co/onnx-community/BEN2-ONNX
- Xenova/modnet — Apache-2.0. Model card: https://huggingface.co/Xenova/modnet

Model weights are fetched by the user browser from Hugging Face and are not included in the application service-worker precache.

## Runtime

- Hugging Face Transformers.js — Apache-2.0: https://github.com/huggingface/transformers.js
- ONNX Runtime — MIT: https://github.com/microsoft/onnxruntime

Transformers.js also declares Sharp for its Node.js image-loading path. Sharp is
Apache-2.0 and its optional platform-specific libvips binaries are
LGPL-3.0-or-later. Those native packages are not imported by the browser worker
and are not present in the production browser bundle. If the Node.js toolchain
or native binaries are redistributed separately, retain their notices and meet
the applicable LGPL requirements.

React, Vite, Lucide and the remaining npm packages use their respective licenses. Retain package notices and license texts when redistributing a bundled commercial build.
