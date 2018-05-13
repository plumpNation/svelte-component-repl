/** @type {Repl.IComponentConfig[]} */
const componentsConfig = [
    {
        name: 'MyComponent',
        type: 'svelte'
    },
    {
        name: 'YourComponent',
        type: 'svelte'
    }
];

init();
    // .catch(e => console.log(e));

let components;

async function init () {
    const editor = setupEditor();

    // Grab the component contents... Keep them available to save another load.
    // @todo: Will need to keep a cache.
    components = await loadComponentSourceFiles(componentsConfig);

    const bundle = await build(editor.getValue());

    // initial render
    render(bundle);
}

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 *
 * @param {string} markup The html string from the editor
 * @returns {Promise<Repl.IBundle>} The bundle of view code for the preview.
 */
async function build(markup = '') {
    const componentsAndApp = components.concat({
        name: 'App',
        type: 'svelte',
        source: createAppTemplate(markup, components)
    });

    // ...compile the contents to js using the svelte compiler.
    const compiled = compileComponents(componentsAndApp);
    const bundle = await createBundle(compiled);

    return bundle;
}

/**
 * Prints out svelte compiler warnings.
 *
 * @param {Repl.ICompiledComponent} component Svelte compiler output for a component.
 * @returns {string}
 */
function printCompilerWarnings(component) {
    const w = component && component.warnings && component.warnings.length;

    if (!w) {
        return;
    }

    console.group(`${component.name}.${component.type}: ${w} ${w === 1 ? 'warning' : 'warnings'}`);

    component.warnings.forEach(warning => {
        console.warn(warning.message);
        console.log(warning.frame);
    });

    console.groupEnd();
}

function createAppTemplate(markup, components) {
    // NOTE: we replace //imports//, **markup** and [components]
    const template = `**markup**

<script>
    //imports//

    export default {
        components: {
            [components]
        }
    };
</script>`;

    // If the component name cannot be found, we probably don't need it.
    const componentsFoundInMarkup = components
        .filter(component => markup.includes(component.name));

    // Create es import formatters
    const imports = componentsFoundInMarkup.map(component => {
        return `import ${component.name} from './${component.name}';\n`;
    }).join('');

    // Format the list of components for the svelte `components` property
    const componentNames = componentsFoundInMarkup
        .map(component => `${component.name}`)
        .join(',\n');

    return template
        .replace('**markup**', markup)
        .replace('//imports//', imports)
        .replace('[components]', componentNames);
}

/**
 * Fetches the raw file contents and attaches it to the component.source property.
 * For now we store them in the components folder. If you supply a `path` it should
 * contain the filename in the path.
 *
 * @param {Repl.IComponentConfig[]} components
 * @returns {Promise<Repl.IComponentConfig[]>}
 */
async function loadComponentSourceFiles(components) {
    const requests = await components.map(loadComponentSource);

    return Promise.all(requests);
}

/**
 * Fetches the raw file contents and attaches it to the component.source property.
 *
 * @param {Repl.IComponentConfig} component
 * @returns {Promise<Repl.IComponentConfig>}
 */
async function loadComponentSource(component) {
    const path = component.path || `./components/${component.name}.${component.type}`;

    const source = await fetch(path).then(res => res.text());

    return {...component, source};
}

/**
 * Compile an array of components.
 *
 * @param {Repl.IComponentConfig[]} components
 * @returns {Repl.ICompiledComponent[]}
 */
function compileComponents(components) {
    console.info(`Svelte compiler version %c${svelte.VERSION}`, 'font-weight: bold');

    const complilations = components
        .filter(component => component.type === 'svelte')
        .map((component, index) => {
            const compiled = compileComponent(component);

            if (compiled) {
                printCompilerWarnings(compiled);
            }

            return {...compiled, ...components[index]};
        });

    return complilations;
}

/**
 * Compile a component with the Svelte compiler.
 *
 * @param {Repl.IComponentConfig} component
 * @returns {Repl.ICompiledComponent}
 */
function compileComponent(component) {
    const warnings = [];

    const compileOptions = {
        cascade: false,
        name: component.name,
        format: 'es',
        filename: component.name + '.svelte',
        onwarn: warning => {
            warnings.push(warning);
        }
    };

    try {
        const {js} = svelte.compile(component.source || '', compileOptions);

        return {...js, warnings};
    } catch (e) {}
}

function render(bundle) {
    /** @type {HTMLIFrameElement} */
    const preview = document.querySelector('#preview');

    preview.onload = () => {
        let markup = `
            <App></App>

            <script>
                ${bundle.code}

                const target = document.querySelector('App');

                new App({target});

                console.log('App code running');
            </script>`;

        preview.contentDocument.body.innerHTML = markup;

        // We need to eval the js since it's been injected.
        const scriptTags = preview.contentDocument.body.getElementsByTagName('script');

        [].forEach.call(scriptTags, scriptTag => {
            try {
                preview.contentWindow.eval(scriptTag.text);
            } catch(err) {
                console.warn('eval of scripts failed');
            }
        });
    };

    // @TODO: See how to garbage collect eval() scripts.
    preview.src = 'about:blank';
}

/**
 * Removes original mount element from DOM.
 *
 * @param {HTMLTextAreaElement} target
 * @returns {(HTMLElement) => void}
 */
function mountReplace(target) {
    /**
     * @param {HTMLElement} elt
     * @returns {void}
     */
    return elt => {
        target.parentNode.replaceChild(elt, target);
    };
}

/**
 * @param {Repl.ICompiledComponent[]} components
 * @returns {Promise<Repl.IBundle>}
 */
async function createBundle(components) {
    if (!components || !components.length) {
        console.info('no components to bundle');

        return;
    }

    if (components.some(c => !c.code)) {
        console.warn('uncompiled components found');

        return;
    }

    // https://rollupjs.org/guide/en#rollup-rollup
    const bundler = await rollup.rollup({
        input: './App', // relative syntax, no file extension

        // Comma-separate list of module IDs to exclude
        external: id => id[0] !== '.',

        plugins: [{
            resolveId(importee, importer) {
                if (importee[0] === '.') return importee;
            },

            load(id) {
                const appCode = components.find(component => './' + component.name === id);

                return appCode;
            }
        }],

        onwarn(warning) {
            if (warning.code === 'MISSING_GLOBAL_NAME') return;

            console.warn(warning.message);
        }
    });

    let uid = 1;

    const {code, map} = await bundler.generate({
        format: 'iife',
        name: 'App',
        globals: id => `import_${uid++}`,
        sourcemap: true
    });

    // Why is this is a store?
    const bundle = {
        code,
        map,
        imports: bundler.imports
    };

    return bundle;
}

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

function setupEditor() {
    /** @type {HTMLTextAreaElement} */
    const textarea = document.querySelector('#editor');

    /** @type {string} */
    // Default content to render.
    textarea.value = `
<h1 class="foobar">HelloWorld</h1>

<p>Here is a component to play with. Goody.</p>

<MyComponent></MyComponent>
<YourComponent></YourComponent>`;

    /** @type {CodeMirror.EditorConfiguration} */
    const codeMirrorConfig = {
        extraKeys: {
            'Ctrl-Space': 'autocomplete',
            "'<'": completeAfter,
            "'/'": completeIfAfterLt,
            "' '": completeIfInTag,
            "'='": completeIfInTag,
        },
        lineNumbers: true,
        mode: 'text/html',
        value: textarea.value,
        autoCloseTags: true,
        showTrailingSpace: true,
        theme: 'ambiance'
    };

    // ///////////////////////////////////////// HINTING ///////////////////////////////////////////

    // We need to provide a list of tags in the autocomplete.
    const originalHTMLHint = CodeMirror.hint.html;

    // All we really do in this override, is to add our custom components to the
    // HTML autocomplete list.
    CodeMirror.hint.html = function(cm) {
        const componentNames = componentsConfig.map(component => '<' + component.name);
        const inner = originalHTMLHint(cm) || {from: cm.getCursor(), to: cm.getCursor(), list: []};

        inner.list.unshift.apply(inner.list, componentNames);

        return inner;
    };

    function completeAfter(cm, pred) {
        var cur = cm.getCursor();

        if (!pred || pred()) {
            setTimeout(function() {
                if (!cm.state.completionActive) {
                    cm.showHint({completeSingle: false});
                }
            }, 100);
        }

        return CodeMirror.Pass;
    }

    function completeIfInTag(cm) {
        return completeAfter(cm, function() {
            const tok = cm.getTokenAt(cm.getCursor());

            if (tok.type === 'string' &&
                !/['"]/.test(tok.string.charAt(tok.string.length - 1)) || tok.string.length == 1
            ) {
                return false;
            }

            const inner = CodeMirror.innerMode(cm.getMode(), tok.state).state;

            return inner.tagName;
        });
    }

    function completeIfAfterLt(cm) {
        return completeAfter(cm, function () {
            var cur = cm.getCursor();

            return cm.getRange(CodeMirror.Pos(cur.line, cur.ch - 1), cur) === '<';
        });
    }

    /** @type {CodeMirror.Editor} */
    const codeMirror = CodeMirror(mountReplace(textarea), codeMirrorConfig);

    codeMirror.on('change', _.throttle(async editor => {
        const bundle = await build(editor.getValue());

        if (bundle) {
            return render(bundle);
        }

        console.warn('Hey, there was no bundle')
    }, 500));

    return codeMirror;
}
