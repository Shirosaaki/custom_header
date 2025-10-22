# proHeader

proHeader is a small VS Code extension that inserts a customizable file header for C/C++ source and header files. It supports:

- .c — inserts a comment block with filename, short description, Author and Date.
- .h — inserts the comment block plus an include guard (suggested macro editable at prompt).
- .hpp — inserts the comment block, include guard, and a class skeleton inferred from the filename.
- .cpp — inserts an `#include "Name.hpp"` and simple constructor/destructor stubs for the class inferred from the filename.

## Usage

1. Open a C/C++ file in the editor (e.g. `keyboard.c`, `Game.hpp`, `Game.cpp`).
2. Press `Ctrl+Shift+H` or run the command `Insert Pro Header` from the Command Palette.
3. Fill the prompts (Author, Description, and include guard when prompted). The header is inserted at the top of the file.

## Examples

C file header (keyboard.c):

```c
/**==============================================
 *                keyboard.c
 *  Keyboard driver implementation
 *  Author: DaniilSte
 *  Date: 2025-10-22
 *=============================================**/

```

Header file (`Game.hpp`) produced sample:

```c
#ifndef GAME_HPP_
#define GAME_HPP_

class Game {
	public:
		Game();
		~Game();

	protected:
	private:
};

#endif /* !GAME_HPP_ */
```

CPP file (`Game.cpp`) produced sample:

```c
#include "Game.hpp"

Game::Game()
{
}

Game::~Game()
{
}
```

## Packaging and publishing

To create a .vsix package locally (no global installs required):

```bash
# use nvm to install node 20+ if you need it
npx @vscode/vsce package
```

To publish to the Marketplace, create a publisher and a PAT, then:

```bash
npx @vscode/vsce login <publisher-name>
npx @vscode/vsce publish
```

## Development notes

- Keybinding: `Ctrl+Shift+H` is registered for `proheader.insertHeader` by default (when editor has focus). If your OS captures that key, remap it in VS Code.
- Author prompt defaults to your environment `USER` if available.

## License

Include your license here, for example MIT.

---

If you want, I can run the packaging step (`npx @vscode/vsce package`) and fix any remaining issues.
