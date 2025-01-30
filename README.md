# cursor-composer-export

**cursor-composer-export** is a CLI tool to capture and integrate AI coding conversations, which can be used as a Git pre-commit hook that appends Cursor composer history to `.composer-logs` folder, with the purpose of providing a clear record of AI code generation rationale. 

Reference code from [cursor-chat-browser](https://github.com/thomas-pedersen/cursor-chat-browser).

## Install

```bash
npm install --save-dev cursor-composer-export
```

## Usage

```bash
cursor-composer-export [output-path]
```

## Install Git Hook

```bash
cursor-composer-export install-hook
```

This will:
1. Create a pre-commit hook that runs the exporter
2. Keep Husky's native management

## Uninstall Git Hook

```bash
cursor-composer-export uninstall-hook
```
