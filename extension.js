const vscode = require('vscode');
const path = require('path');

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(d) {
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

function makeCommentBlock(filename, description, author, date, style = 'block') {
	// style: 'block' -> C-style block
	//        'hash'  -> each line prefixed with '# '
	//        'cpp'   -> each line prefixed with '// '
	const inner = [];
	inner.push('==============================================');
	inner.push(`                ${filename}`);
	if (description) inner.push(` ${description}`);
	if (author) inner.push(` Author: ${author}`);
	if (date) inner.push(` Date: ${date}`);
	inner.push('=============================================');

	if (style === 'block') {
		const lines = [];
		// Top border
		lines.push('/**' + inner[0]);
		// Middle lines (exclude first and last)
		for (let i = 1; i < inner.length - 1; i++) {
			lines.push(` * ${inner[i]}`);
		}
		// Bottom border with closing
		lines.push(' *' + inner[inner.length - 1] + '**/');
		return lines.join('\n') + '\n\n';
	} else if (style === 'hash' || style === 'cpp') {
		const prefix = style === 'hash' ? '# ' : '// ';
		const lines = inner.map(l => prefix + l);
		return lines.join('\n') + '\n\n';
	}

	// fallback to block
	return makeCommentBlock(filename, description, author, date, 'block');
}

function detectStyle(extNoDot, basenameWithExt) {
	const b = basenameWithExt.toLowerCase();
	if (extNoDot === 'py') return { style: 'hash', shebang: true };
	if (extNoDot === '' && b === 'makefile') return { style: 'hash', shebang: false };
	// keep existing behavior for C/C++ family
	return { style: 'block', shebang: false };
}

function makeGuardMacro(basename, ext) {
	// basename: without extension, ext: 'h' or 'hpp' etc
	const raw = (basename + '_' + ext).replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
	return raw + '_';
}

function toClassName(basename) {
	// convert something_like_game or game-name to PascalCase: GameName
	return basename.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

/**
 * Insert header into a TextDocument without prompting (used for automatic insertion
 * on file creation / new untitled documents).
 */
async function autoInsertHeaderForDocument(doc) {
	// Only insert into empty files
	try {
		if (!doc || typeof doc.getText !== 'function') return;
		// don't overwrite existing content or duplicate headers
		const text = doc.getText();
		if (text.trim().length > 0) {
			// If it already contains a header at the top, skip
			if (hasHeaderAtTop(text)) return;
			return; // don't overwrite non-empty files
		}

		const filePath = doc.fileName || (doc.uri && doc.uri.fsPath) || '';
		const ext = path.extname(filePath).toLowerCase();
		const basenameWithExt = path.basename(filePath || (doc.uri && doc.uri.path) || '');
		const basename = path.basename(basenameWithExt, ext);
		const extNoDot = ext.startsWith('.') ? ext.slice(1) : ext;

	const config = vscode.workspace.getConfiguration('proheader');
	const defaultAuthor = config.get('defaultAuthor') || process.env.GIT_AUTHOR_NAME || process.env.USER || '';
		const description = '';
		const today = formatDate(new Date());

		const detected = detectStyle(extNoDot, basenameWithExt);
		// Create the base comment block
		let toInsert = makeCommentBlock(basenameWithExt, description, defaultAuthor, today, detected.style);

		// Non-interactive variants for C/C++ specific additions
		if (extNoDot === 'h') {
			const defaultMacro = makeGuardMacro(basename, 'H');
			toInsert += `#ifndef ${defaultMacro}\n#define ${defaultMacro}\n\n\n#endif /* !${defaultMacro} */\n`;
		} else if (extNoDot === 'hpp') {
			const defaultMacro = makeGuardMacro(basename, 'HPP');
			const className = toClassName(basename);
			const classBlock = [];
			classBlock.push(`class ${className} {`);
			classBlock.push('    public:');
			classBlock.push(`        ${className}();`);
			classBlock.push(`        ~${className}();`);
			classBlock.push('');
			classBlock.push('    protected:');
			classBlock.push('    private:');
			classBlock.push('};');
			toInsert += `#ifndef ${defaultMacro}\n#define ${defaultMacro}\n\n` + classBlock.join('\n') + '\n\n#endif /* !' + defaultMacro + ' */\n';
		} else if (extNoDot === 'cpp') {
			const className = toClassName(basename);
			const headerFile = basename + '.hpp';
			const impl = [];
			impl.push(`#include "${headerFile}"\n`);
			impl.push(`${className}::${className}()`);
			impl.push('{');
			impl.push('}');
			impl.push('');
			impl.push(`${className}::~${className}()`);
			impl.push('{');
			impl.push('}');
			impl.push('');
			toInsert += impl.join('\n');
		}

		// Prepend shebang for scripts that need it
		if (detected && detected.shebang) {
			toInsert = '#!/usr/bin/env python3\n' + toInsert;
		}

		const edit = new vscode.WorkspaceEdit();
		edit.insert(doc.uri, new vscode.Position(0, 0), toInsert);
		await vscode.workspace.applyEdit(edit);
	} catch (err) {
		console.error('proheader: autoInsertHeaderForDocument error', err);
	}
}

/**
 * Interactive insertion used when a file is created on disk. This prompts the
 * user for author and description (so they can type their GitHub username)
 * before inserting the header. Falls back to defaults if user cancels inputs.
 */
async function interactiveInsertForCreatedDocument(doc) {
	try {
		if (!doc || typeof doc.getText !== 'function') return;

		const text = doc.getText();
		if (text.trim().length > 0) {
			if (hasHeaderAtTop(text)) return;
			return; // don't overwrite non-empty files
		}

		const filePath = doc.fileName || (doc.uri && doc.uri.fsPath) || '';
		const ext = path.extname(filePath).toLowerCase();
		const basenameWithExt = path.basename(filePath || (doc.uri && doc.uri.path) || '');
		const basename = path.basename(basenameWithExt, ext);
		const extNoDot = ext.startsWith('.') ? ext.slice(1) : ext;

	// Prompt for author and description (allow cancel -> use defaults)
	const config = vscode.workspace.getConfiguration('proheader');
	const defaultAuthor = config.get('defaultAuthor') || process.env.GIT_AUTHOR_NAME || process.env.USER || '';
	const authorInput = await vscode.window.showInputBox({ prompt: 'Author (github)', placeHolder: 'Your GitHub username or name', value: defaultAuthor });
	const author = authorInput || defaultAuthor;
	const description = await vscode.window.showInputBox({ prompt: 'Short description (shown under filename)', placeHolder: 'Short description', value: '' });
		const today = formatDate(new Date());

		const detected = detectStyle(extNoDot, basenameWithExt);
		let toInsert = makeCommentBlock(basenameWithExt, description || '', author || defaultAuthor, today, detected.style);

		// Non-interactive C/C++ additions (same as autoInsert)
		if (extNoDot === 'h') {
			const defaultMacro = makeGuardMacro(basename, 'H');
			toInsert += `#ifndef ${defaultMacro}\n#define ${defaultMacro}\n\n\n#endif /* !${defaultMacro} */\n`;
		} else if (extNoDot === 'hpp') {
			const defaultMacro = makeGuardMacro(basename, 'HPP');
			const className = toClassName(basename);
			const classBlock = [];
			classBlock.push(`class ${className} {`);
			classBlock.push('    public:');
			classBlock.push(`        ${className}();`);
			classBlock.push(`        ~${className}();`);
			classBlock.push('');
			classBlock.push('    protected:');
			classBlock.push('    private:');
			classBlock.push('};');
			toInsert += `#ifndef ${defaultMacro}\n#define ${defaultMacro}\n\n` + classBlock.join('\n') + '\n\n#endif /* !' + defaultMacro + ' */\n';
		} else if (extNoDot === 'cpp') {
			const className = toClassName(basename);
			const headerFile = basename + '.hpp';
			const impl = [];
			impl.push(`#include "${headerFile}"\n`);
			impl.push(`${className}::${className}()`);
			impl.push('{');
			impl.push('}');
			impl.push('');
			impl.push(`${className}::~${className}()`);
			impl.push('{');
			impl.push('}');
			impl.push('');
			toInsert += impl.join('\n');
		}

		if (detected && detected.shebang) {
			toInsert = '#!/usr/bin/env python3\n' + toInsert;
		}

		const edit = new vscode.WorkspaceEdit();
		edit.insert(doc.uri, new vscode.Position(0, 0), toInsert);
		await vscode.workspace.applyEdit(edit);

		// If user entered an author and it's different from saved config, persist it
		try {
			if (authorInput && authorInput !== config.get('defaultAuthor')) {
				await config.update('defaultAuthor', authorInput, vscode.ConfigurationTarget.Global);
			}
		} catch (err) {
			console.error('proheader: failed to save defaultAuthor config', err);
		}
	} catch (err) {
		console.error('proheader: interactiveInsertForCreatedDocument error', err);
	}
}

function hasHeaderAtTop(text) {
	if (!text || typeof text !== 'string') return false;
	const head = text.split('\n').slice(0, 8).join('\n');
	// detect common header signatures: C block, hash border, shebang + border
	if (/\/\*\*/.test(head)) return true; // /**
	if (/^#!/.test(head.trim())) {
		// shebang exists, check next lines for header border
		const rest = text.split('\n').slice(0, 10).join('\n');
		if (/={3,}/.test(rest) || /#+\s*={3,}/.test(rest)) return true;
	}
	if (/={3,}/.test(head)) return true; // lines of ===
	if (/^#\s*={3,}/m.test(head)) return true;
	return false;
}

/**
 * Insert header based on file extension
 */
async function insertHeader() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active editor - open a file to insert a header.');
		return;
	}

	const doc = editor.document;
	const filePath = doc.fileName;
	const ext = path.extname(filePath).toLowerCase(); // includes dot
	const basenameWithExt = path.basename(filePath);
	const basename = path.basename(filePath, ext);
	const extNoDot = ext.startsWith('.') ? ext.slice(1) : ext;

	// Ask for Author and Description (use saved config if available)
	const config = vscode.workspace.getConfiguration('proheader');
	const savedAuthor = config.get('defaultAuthor') || process.env.GIT_AUTHOR_NAME || process.env.USER || '';
	const authorInput = await vscode.window.showInputBox({ prompt: 'Author (github)', placeHolder: 'Your GitHub username or name', value: savedAuthor });
	const author = authorInput || savedAuthor;
	const description = await vscode.window.showInputBox({ prompt: 'Short description (shown under filename)', placeHolder: 'Short description', value: '' });
	const today = formatDate(new Date());

	const detected = detectStyle(extNoDot, basenameWithExt);
	const comment = makeCommentBlock(basenameWithExt, description, author, today, detected.style);

	let toInsert = comment;

	if (extNoDot === 'c') {
		// only comment
	} else if (extNoDot === 'h') {
		const defaultMacro = makeGuardMacro(basename, 'H');
		const guard = await vscode.window.showInputBox({ prompt: 'Include guard macro', value: defaultMacro });
		const guardMacro = guard || defaultMacro;
		toInsert += `#ifndef ${guardMacro}\n#define ${guardMacro}\n\n\n#endif /* !${guardMacro} */\n`;
	} else if (extNoDot === 'hpp') {
		const defaultMacro = makeGuardMacro(basename, 'HPP');
		const guard = await vscode.window.showInputBox({ prompt: 'Include guard macro', value: defaultMacro });
		const guardMacro = guard || defaultMacro;
		const className = toClassName(basename);
		const classBlock = [];
		classBlock.push(`class ${className} {`);
		classBlock.push('    public:');
		classBlock.push(`        ${className}();`);
		classBlock.push(`        ~${className}();`);
		classBlock.push('');
		classBlock.push('    protected:');
		classBlock.push('    private:');
		classBlock.push('};');

		toInsert += `#ifndef ${guardMacro}\n#define ${guardMacro}\n\n` + classBlock.join('\n') + '\n\n#endif /* !' + guardMacro + ' */\n';
	} else if (extNoDot === 'cpp') {
		const className = toClassName(basename);
		const headerFile = basename + '.hpp';
		const impl = [];
		impl.push(`#include "${headerFile}"\n`);
		impl.push(`${className}::${className}()`);
		impl.push('{');
		impl.push('}');
		impl.push('');
		impl.push(`${className}::~${className}()`);
		impl.push('{');
		impl.push('}');
		impl.push('');
		toInsert += impl.join('\n');
	} else {
		// For any other extension (or files with no extension), default to inserting
		// only the comment header. `toInsert` already contains the comment block
		// created above. This removes the previous limitation that displayed an
		// "unsupported" message and returned early.
		// Future: customize templates per-language here if desired.
	}

	// If the detected style requested a shebang (e.g. Python), put it on the
	// very first line (shebang must be first). Prepend shebang before the
	// comment block so Python files start with the interpreter line.
	if (detected && detected.shebang) {
		toInsert = '#!/usr/bin/env python3\n' + toInsert;
	}

	// If a header already exists at the top, do not insert and inform the user
	const existing = doc.getText();
	if (hasHeaderAtTop(existing)) {
		vscode.window.showInformationMessage('A header already exists in this file.');
		return;
	}

	// Insert at top of document
	await editor.edit(editBuilder => {
		editBuilder.insert(new vscode.Position(0, 0), toInsert);
	});

	// Persist author if the user entered a new one
	try {
		if (authorInput && authorInput !== config.get('defaultAuthor')) {
			await config.update('defaultAuthor', authorInput, vscode.ConfigurationTarget.Global);
		}
	} catch (err) {
		console.error('proheader: failed to save defaultAuthor config', err);
	}

	vscode.window.showInformationMessage('Pro header inserted.');
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('proheader extension is now active');

	const disposable = vscode.commands.registerCommand('proheader.insertHeader', insertHeader);
	context.subscriptions.push(disposable);

	// Automatically insert header when files are created on disk
	const onCreate = vscode.workspace.onDidCreateFiles(async (e) => {
		for (const uri of e.files) {
			try {
				const doc = await vscode.workspace.openTextDocument(uri);
				// Prompt the user for author/description so they can enter GitHub user and description
				await interactiveInsertForCreatedDocument(doc);
			} catch (err) {
				// ignore errors opening/processing the file
				console.error('proheader: failed to auto-insert header for created file', err);
			}
		}
	});
	context.subscriptions.push(onCreate);

	// NOTE: we intentionally do NOT auto-insert on document open/untitled documents
	// to avoid double-insertion and not to block user input. Auto-insert only
	// runs for files created on disk (onDidCreateFiles).

	// keep the sample helloWorld for compatibility/debug
	const hello = vscode.commands.registerCommand('proheader.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from proHeader!');
	});
	context.subscriptions.push(hello);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
};
