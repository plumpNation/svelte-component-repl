const store = {};

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

let renderer;

init();

async function init () {
    const editor = setupEditor();

    // Grab the component contents...
    const components = await loadComponentsSource(componentsConfig);
    const appSource = createAppTemplate(editor.getValue(), components);

    console.log(appSource);

    components.push({
        name: 'App',
        type: 'svelte',
        source: appSource
    });

    // ...compile the contents to js using the svelte compiler.
    const compiled = await compileComponents(components);

    updateBundle(compiled);

    // initial render
    renderer();
}

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Prints out svelte compiler warnings.
 *
 * @param {Repl.ICompiledComponent} component Svelte compiler output for a component.
 * @returns {string}
 */
function printCompilerWarnings(component) {
    const w = component.warnings.length;

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

    // Create es import formatters
    const imports = components.map(component => {
        return `import ${component.name} from './${component.name}';\n`;
    }).join('');

    // Format the list of components for the svelte `components` property
    const componentNames = components
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
async function loadComponentsSource(components) {
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
 * @returns {Promise<Repl.ICompiledComponent[]>}
 */
async function compileComponents(components) {
    const complilations = components
        .filter(component => component.type === 'svelte')
        .map((component, index) => {
            const compiled = compileComponent(component);

            printCompilerWarnings(compiled);

            return {...compiled, ...components[index]};
        });

    return Promise.all(complilations);
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

    const {js} = svelte.compile(component.source || '', compileOptions);

    return {...js, warnings};
}

function render(output) {
    return editor => {
        let markup = '';

        if (store.bundle) {
            markup += `<script>
                ${store.bundle.code}

                store.target = document.querySelector('MyComponent');

                new MyComponent({target: store.target});
            </script>`;
        }

        markup += editor.doc.getValue();

        // not great
        output.innerHTML = markup;

        const scriptTags = output.getElementsByTagName('script');

        [].forEach.call(scriptTags, scriptTag => {
            eval(scriptTag.text);
        });
    };
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

function updateBundle(components) {
    if (!components || !components.length) {
        console.info('no components to bundle');

        return;
    }

    if (components.some(c => !c.code)) {
        console.warn('uncompiled components found');

        return;
    }

    console.log(`running Svelte compiler version %c${svelte.VERSION}`, 'font-weight: bold');

    if (window.bundlePromise) {
        window.bundlePromise.cancel();
    }

    const lookup = {};

    components.forEach(component => {
        const path = `./${component.name}.${component.type}`;

        if (path in lookup) {
            throw new TypeError(`Multiple ${component.name}.${component.type} components`);
        }

        lookup[path] = component;
    });

    let cancelled = false;

    let uid = 1;
    const importMap = new Map();

    // here we can move between different entry points
    const input = './App';

    window.bundlePromise = rollup.rollup({
        input,

        external: id => id[0] !== '.',

        plugins: [{
            resolveId(importee, importer) {
                if (importee[0] === '.') return importee;
            },

            load(id) {
                debugger;

                const appCode = components.find(component => './' + component.name === id);

                return appCode;
            }
        }],

        onwarn(warning) {
            if (warning.code === 'MISSING_GLOBAL_NAME') return;

            console.warn(warning.message);
        }
    })
    .then(bundle => {
        if (cancelled) return;

        return bundle.generate({
            format: 'iife',
            name: 'MyComponent',
            globals: id => {
                const name = `import_${uid++}`;
                importMap.set(id, name);
                return name;
            },
            sourcemap: true
        })
        .then(({ code, map }) => {
            store.bundle = {
                code,
                map,
                imports: bundle.imports,
                importMap
            };

            store.bundleError = null;
            store.runtimeError = null;

            renderer();
        });
    })
    .catch(err => {
        console.error(err.stack);

        store.bundleError = err;
    });

    window.bundlePromise.cancel = () => {
        cancelled = true;
    };
}

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

function setupEditor() {
    /** @type {HTMLTextAreaElement} */
    const textarea = document.querySelector('#code-editor-mount');

    /** @type {HTMLElement} */
    const output = document.querySelector('#output');

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
            '"<"': 'autocomplete'
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

    function completeIfAfterLt(cm) {
        return completeAfter(cm, function () {
            var cur = cm.getCursor();

            return cm.getRange(CodeMirror.Pos(cur.line, cur.ch - 1), cur) === '<';
        });
    }

    /** @type {CodeMirror.Editor} */
    const codeMirror = CodeMirror(mountReplace(textarea), codeMirrorConfig);

    renderer = () => {
        render(output)(codeMirror);
    };

    codeMirror.on('change', _.throttle(render(output), 500));

    return codeMirror;
}
