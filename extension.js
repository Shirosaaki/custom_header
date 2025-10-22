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

function makeCommentBlock(filename, description, author, date) {
	const lines = [];
	lines.push('/**==============================================');
	lines.push(` *                ${filename}`);
	if (description) lines.push(` *  ${description}`);
	if (author) lines.push(` *  Author: ${author}`);
	if (date) lines.push(` *  Date: ${date}`);
	lines.push(' *=============================================**/');
	return lines.join('\n') + '\n\n';
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

	// Ask for Author and Description
	const defaultAuthor = process.env.GIT_AUTHOR_NAME || process.env.USER || '';
	const author = await vscode.window.showInputBox({ prompt: 'Author (github)', placeHolder: 'Your GitHub username or name', value: defaultAuthor });
	const description = await vscode.window.showInputBox({ prompt: 'Short description (shown under filename)', placeHolder: 'Short description', value: '' });
	const today = formatDate(new Date());

	const comment = makeCommentBlock(basenameWithExt, description, author, today);

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
		vscode.window.showInformationMessage(`Extension ${extNoDot} is not supported by proHeader.`);
		return;
	}

	// Insert at top of document
	await editor.edit(editBuilder => {
		editBuilder.insert(new vscode.Position(0, 0), toInsert);
	});

	vscode.window.showInformationMessage('Pro header inserted.');
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('proheader extension is now active');

	const disposable = vscode.commands.registerCommand('proheader.insertHeader', insertHeader);
	context.subscriptions.push(disposable);

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
