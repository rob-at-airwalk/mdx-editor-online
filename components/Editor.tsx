/* eslint-disable react/no-unstable-nested-components */
import '@mdxeditor/editor/style.css';

import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  CodeMirrorEditor,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertFrontmatter,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  addComposerChild$,
  realmPlugin,
  rootEditor$,
  usedLexicalNodes$,
  activeEditor$,
} from '@mdxeditor/editor';

import SaveIcon from '@mui/icons-material/Save';
import { Alert, css, Fab } from '@mui/material';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import type { Theme } from '@mui/material/styles';
import { styled } from '@mui/material/styles';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ContentItem } from '@/lib/Types';
import { baseTheme } from '@/styles/baseTheme';
// import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { WebsocketProvider } from 'y-websocket';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  EditorState,
  LexicalEditor,
  createEditor,
} from "lexical";
import * as Y from "yjs";
// @ts-ignore
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import dynamic from 'next/dynamic';

const CollaborationPlugin = dynamic(
  () => import("@lexical/react/LexicalCollaborationPlugin").then((mod) => mod.CollaborationPlugin),
  {
    ssr: false,
  }
);

const initialConfig = {
  // NOTE: This is critical for collaboration plugin to set editor state to null. It
  // would indicate that the editor should not try to set any default state
  // (not even empty one), and let collaboration plugin do it instead
  editorState: null,
  namespace: "Demo",
  nodes: [],
  onError: (error: Error) => {
    throw error;
  },
  theme: {},
};

const toKebabCase = (str: string) => {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
};

const convertStyleObjectToCSS = (
  styleObject: Theme['typography'],
  indent: string = ''
): string => {
  let cssString = '';

  for (const [key, value] of Object.entries(styleObject)) {
    if (typeof value === 'object') {
      cssString += `${indent}${toKebabCase(key)} {\n`;
      cssString += convertStyleObjectToCSS(value, `${indent}  `);
      cssString += `${indent}}\n`;
    } else {
      cssString += `${indent}${toKebabCase(key)}: ${value};\n`;
    }
  }

  return cssString;
};

interface EditorProps {
  markdown: string;
  context: ContentItem;
  defaultContext: ContentItem | undefined;
  editorSaveHandler: (arg: string) => Promise<string>;
  imageUploadHandler: (image: File) => Promise<any>;
  imagePreviewHandler: (imageSource: string) => Promise<string>;
  enabled?: boolean;
  top: number;
  editorRef?: React.MutableRefObject<MDXEditorMethods | null>;
}

const Editor = React.memo(function EditorC({
  markdown: initialMarkdown,
  context,
  defaultContext,
  editorSaveHandler,
  imageUploadHandler,
  imagePreviewHandler,
  enabled = true,
  top,
  editorRef,
}: EditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const changedRef = useRef(false);
  const typographyCopy = { ...baseTheme.typography } as Theme['typography'];
  const importedCss = convertStyleObjectToCSS(typographyCopy);

  const StyledMDXEditor = styled(MDXEditor)`
    font-family: 'Heebo';
    font-weight: 200;
    font-size: 14;
    [role='toolbar'] {
    }
    [class*='_contentEditable_'] {
      height: calc(100vh - ${top}px);
      overflow-y: auto;
      overflow-x: hidden;
    }
    [role='textbox'] {
    }
    [class^='_rootContentEditableWrapper'] {
      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        font-weight: 200;
        line-height: 1.2l;
      }
      h1 {
        font-size: '3rem';
      }
      h2 {
        font-size: '2rem';
      }
      h3 {
        font-size: '1rem';
      }
      ${css`
        ${importedCss}
      `}
      .cm-gutters {
        margin-right: 1%;
        margin-left: 1%;
      }
      .cm-scroller {
        display: flex;
      }
    }
    img {
      max-width: 50%;
      height: auto;
    }
  `;

  const editorCallback = useCallback(
    (callback: string) => {
      if (
        !initialMarkdown &&
        defaultContext &&
        context.branch !== defaultContext.branch
      ) {
        changedRef.current = true;
      } else if (
        initialMarkdown &&
        callback.trim() !== initialMarkdown.trim() &&
        defaultContext &&
        context.branch !== defaultContext.branch
      ) {
        changedRef.current = true;
      } else {
        changedRef.current = false;
      }
    },
    [initialMarkdown, defaultContext, context.branch]
  );
  

  const initialEditorState = (editor: LexicalEditor): void => {
    const root = $getRoot();
    const paragraph = $createParagraphNode();
    const text = $createTextNode();
    paragraph.append(text);
    root.append(paragraph);
  }

  const collaborationPlugin = useMemo(() => realmPlugin({
    postInit(realm) {
      const newEditor = createEditor({
        editable: true,
        namespace: 'MDXEditor',
        nodes: realm.getValue(usedLexicalNodes$),
        onError: (error) => {
          throw error
        },
        // theme: lexicalTheme
      })
      realm.pub(rootEditor$, newEditor)
      realm.pub(activeEditor$, newEditor)

      realm.pub(addComposerChild$, () => (
        <CollaborationPlugin 
          id="test06"
          // @ts-ignore
          providerFactory={(id, yjsDocMap) => {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            let doc = yjsDocMap.get(id);

            if (doc === undefined) {
              doc = new Y.Doc();
              yjsDocMap.set(id, doc);
            } else {
              doc.load();
            }
            const provider = new WebsocketProvider(
              `${protocol}//${window.location.host}`,
              id,
              doc
            );
            
            return provider;
          }}
          initialEditorState={initialEditorState}
          shouldBootstrap={false}
          // username={`ABC-${Math.floor(Math.random() * 100)}`}
        />
        ),
      )
    },
  }), [])

  const editorPlugins = useMemo(
    () => [
      diffSourcePlugin({
        diffMarkdown: initialMarkdown || '',
        viewMode: 'rich-text',
      }),
      codeBlockPlugin({
        codeBlockEditorDescriptors: [
          {
            priority: 100,
            match: () => true,
            Editor: CodeMirrorEditor,
          },
        ],
      }),
      headingsPlugin(),
      frontmatterPlugin(),
      listsPlugin(),
      linkPlugin(),
      imagePlugin(),
      linkDialogPlugin(),
      quotePlugin(),
      tablePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      imagePlugin({
        disableImageResize: true,
        imageUploadHandler: (image) =>
          Promise.resolve(imageUploadHandler(image)),
        imagePreviewHandler: (imageSource) =>
          Promise.resolve(imagePreviewHandler(imageSource)),
      }),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            {' '}
            <UndoRedo />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <CreateLink />
            <InsertTable />
            <InsertImage />
            <InsertCodeBlock />
            <InsertThematicBreak />
            <InsertFrontmatter />
            <DiffSourceToggleWrapper>
              <UndoRedo />
            </DiffSourceToggleWrapper>
          </>
        ),
      }),
      collaborationPlugin()
    ],
    [initialMarkdown, imageUploadHandler, imagePreviewHandler, collaborationPlugin]
  );

  const SaveButton = React.memo(function SaveButton() {
    const [changed, setChanged] = useState(
      defaultContext && context.branch !== defaultContext.branch
    );

    useEffect(() => {
      const interval = setInterval(() => {
        setChanged(changedRef.current);
      }, 100);
      return () => clearInterval(interval);
    }, []);

    return (
      <Fab
        color='primary'
        aria-label='save'
        disabled={!enabled || isLoading || !changed}
        style={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={async () => {
          setIsLoading(true);
          setError('');
          try {
            const text = editorRef?.current?.getMarkdown() ?? 'error';
            await editorSaveHandler(text ?? '');
            setSuccess(true);
          } catch (err: any) {
            setError(err.message);
          } finally {
            setIsLoading(false);
          }
        }}
      >
        {isLoading ? <CircularProgress size={24} /> : <SaveIcon />}
      </Fab>
    );
  });

  return (
    <Paper
      sx={{
        px: '1%',
        maxHeight: 'calc(100vh - 65px)',
        pt: '2%',
        pb: '2%',
        overflow: 'auto',
      }}
      elevation={0}
    >
      {defaultContext && context.branch === defaultContext.branch && (
        <Alert severity='info'>
          The editor is in read-only mode until you change branch
        </Alert>
      )}
      <StyledMDXEditor
        ref={editorRef}
        onChange={editorCallback}
        onError={(msg) => setError(`Error in markdown: ${msg}`)}
        markdown={initialMarkdown || ''}
        plugins={editorPlugins}
        readOnly={defaultContext && context.branch === defaultContext.branch}
        autoFocus
      />
      <SaveButton />
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError('')}
      >
        <Alert
          onClose={() => setError('')}
          severity='error'
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
      <Snackbar
        open={success}
        autoHideDuration={5000}
        onClose={() => setSuccess(false)}
      >
        <Alert
          onClose={() => setSuccess(false)}
          severity='info'
          sx={{ width: '100%' }}
        >
          Saved file
        </Alert>
      </Snackbar>
    </Paper>
  );
});

export default Editor;
