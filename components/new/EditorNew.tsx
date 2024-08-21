/* eslint-disable react/no-unstable-nested-components */
import "@mdxeditor/editor/style.css";

import {
  activeEditor$,
  addComposerChild$,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeBlockNode,
  codeBlockPlugin,
  CodeMirrorEditor,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  DirectiveNode,
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
  realmPlugin,
  TableNode,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  usedLexicalNodes$,
} from "@mdxeditor/editor";
import SaveIcon from "@mui/icons-material/Save";
import { Alert, css, Fab } from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import type { Theme } from "@mui/material/styles";
import { styled } from "@mui/material/styles";
import { createHash } from "crypto";
import { createEditor } from "lexical";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { getLogger } from "@/lib/Logger";
import type { ContentItem } from "@/lib/Types";
import { baseTheme } from "@/styles/baseTheme";

const logger = getLogger().child({ namespace: "Editor" });
logger.level = "debug";

const CollaborationPlugin = dynamic(
  () =>
    import("@lexical/react/LexicalCollaborationPlugin").then(
      (mod) => mod.CollaborationPlugin
    ),
  {
    ssr: false,
  }
);

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const toKebabCase = (str: string) => {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
};

const convertStyleObjectToCSS = (
  styleObject: Theme["typography"],
  indent: string = ""
): string => {
  let cssString = "";

  for (const [key, value] of Object.entries(styleObject)) {
    if (typeof value === "object") {
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
  colabID: string;
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
  colabID,
}: EditorProps) {
  // const [error, setError] = useState('');
  const [isEditable, setIsEditable] = useState(false);
  const collaborationConnection = useRef(0);
  const [isCollaborative, setIsCollaborative] = useState(false);
  const changedRef = useRef(false);
  const errorRef = useRef("");

  // const successRef = useRef(false);
  // const isEditable = useRef(enabled);
  const typographyCopy = { ...baseTheme.typography } as Theme["typography"];
  const importedCss = convertStyleObjectToCSS(typographyCopy);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const StyledMDXEditor = styled(MDXEditor)`
    font-family: "Heebo";
    font-weight: 200;
    font-size: 14;
    [role="toolbar"] {
    }
    [class*="_contentEditable_"] {
      height: calc(100vh - ${top}px);
      overflow-y: auto;
      overflow-x: hidden;
    }
    [role="textbox"] {
    }
    [class^="_rootContentEditableWrapper"] {
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
        font-size: "3rem";
      }
      h2 {
        font-size: "2rem";
      }
      h3 {
        font-size: "1rem";
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

  // const providerFactory = useCallback(
  //   (id: string, yjsDocMap: Map<string, Y.Doc>) => {
  //     let doc = yjsDocMap.get(id);
  //     if (!doc) {
  //       doc = new Y.Doc();
  //       yjsDocMap.set(id, doc);
  //     } else {
  //       doc.load();
  //     }

  //     const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  //     const provider = new WebsocketProvider(
  //       `${protocol}//${window.location.host}/socket.io`,
  //       id,
  //       doc,
  //       {
  //         connect: false,
  //       }
  //     );
  //     provider.on('status', (event: { status: string }) => {
  //       // logger.debug(event.status);
  //       if (event.status === 'connecting') {
  //         if (collaborationConnection.current > 2 && !isCollaborative) {
  //           if (editorRef && editorRef.current) {
  //             editorRef.current.setMarkdown(initialMarkdown);
  //             collaborationConnection.current = 0;
  //             logger.error('Websockets failed, setting initial content');
  //           }
  //         } else if (!isCollaborative) {
  //           logger.debug(
  //             `Websocket connection attempt: ${collaborationConnection.current}`
  //           );
  //           collaborationConnection.current += 1;
  //         }
  //       }
  //       if (event.status === 'connected' && !isCollaborative) {
  //         logger.info('Websockets: Connected');
  //         setIsCollaborative(true);
  //       }
  //     });

  //     provider.on('synced', () => {
  //       // The 'synced' event ensures all data has been loaded
  //       // initializeDocument(doc, initialMarkdown, editorRef);
  //       const meta = doc.getMap('metadata');

  //       const yxmlText = doc.get('root', Y.XmlText);

  //       logger.debug(`Text: ${yxmlText}`);

  //       if (yxmlText.length === 0) {
  //         logger.info('The document is empty, initialising');
  //         if (editorRef && editorRef.current) {
  //           editorRef.current.setMarkdown(initialMarkdown);
  //           // Set the document as initialized
  //           meta.set('initialized', true);
  //           setIsEditable(true);
  //           logger.info('initialising initial content');
  //         }
  //       } else {
  //         logger.info(`The document has content length: ${yxmlText.length}`);
  //         setIsEditable(true);
  //       }
  //       logger.debug(
  //         `Initialised: ${meta.get('initialized')}, content: ${yxmlText}`
  //       );
  //     });

  //     return provider;
  //   },
  //   [editorRef, initialMarkdown, isCollaborative]
  // );

  const collaborationPlugin = useMemo(
    () =>
      realmPlugin({
        postInit(realm) {
          // const rootEditor = realm.getValue(rootEditor$);
          const newEditor = createEditor({
            editable: isEditable,
            namespace: "MDXEditor",
            nodes: realm.getValue(usedLexicalNodes$) ?? [],
            onError: (err: any) => {
              throw err;
            },
            editorState: undefined,
            // theme: rootEditor?._config.theme,
          });
          // realm.pub(rootEditor$, newEditor);
          realm.pub(activeEditor$, newEditor);

          const excludedProperties = new Map();
          excludedProperties.set(TableNode, new Set(["focusEmitter"]));
          excludedProperties.set(
            CodeBlockNode,
            new Set([
              "__focusEmitter",
              "setCode",
              "setMeta",
              "setLanguage",
              "select",
            ])
          );
          excludedProperties.set(DirectiveNode, new Set(["__focusEmitter"]));

          realm.pub(addComposerChild$, () => (
            <CollaborationPlugin
              id={hashString(colabID)}
              // @ts-ignore
              providerFactory={(id, yjsDocMap) => {
                let doc = yjsDocMap.get(id);
                if (!doc) {
                  doc = new Y.Doc();
                  yjsDocMap.set(id, doc);
                } else {
                  doc.load();
                }

                const protocol =
                  window.location.protocol === "https:" ? "wss:" : "ws:";

                const provider = new WebsocketProvider(
                  `${protocol}//${window.location.host}/socket.io`,
                  id,
                  doc,
                  {
                    connect: false,
                  }
                );
                provider.on("status", (event: { status: string }) => {
                  // logger.debug(event.status);
                  if (event.status === "connecting") {
                    if (
                      collaborationConnection.current > 2 &&
                      !isCollaborative
                    ) {
                      if (editorRef && editorRef.current) {
                        editorRef.current.setMarkdown(initialMarkdown);
                        collaborationConnection.current = 0;
                        logger.error(
                          "Websockets failed, setting initial content"
                        );
                      }
                    } else if (!isCollaborative) {
                      logger.debug(
                        `Websocket connection attempt: ${collaborationConnection.current}`
                      );
                      collaborationConnection.current += 1;
                    }
                  }
                  if (event.status === "connected" && !isCollaborative) {
                    logger.info("Websockets: Connected");
                    setIsCollaborative(true);
                  }
                });

                provider.on("synced", () => {
                  // The 'synced' event ensures all data has been loaded
                  // initializeDocument(doc, initialMarkdown, editorRef);
                  const meta = doc.getMap("metadata");

                  const yxmlText = doc.get("root", Y.XmlText);

                  logger.debug(`Text: ${yxmlText}`);

                  if (yxmlText.length === 0) {
                    logger.info("The document is empty, initialising");
                    if (editorRef && editorRef.current) {
                      editorRef.current.setMarkdown(initialMarkdown);
                      // Set the document as initialized
                      meta.set("initialized", true);
                      setIsEditable(true);
                      logger.info("initialising initial content");
                    }
                  } else {
                    logger.info(
                      `The document has content length: ${yxmlText.length}`
                    );
                    setIsEditable(true);
                  }
                  logger.debug(
                    `Initialised: ${meta.get(
                      "initialized"
                    )}, content: ${yxmlText}`
                  );
                });

                return provider;
              }}
              shouldBootstrap={false}
              excludedProperties={excludedProperties}
              username={`ABC-${Math.floor(Math.random() * 100)}`}
              cursorsContainerRef={containerRef}
            />
          ));
        },
      }),
    [isEditable, colabID, isCollaborative, editorRef, initialMarkdown]
  );

  const editorPlugins = useMemo(
    () => [
      diffSourcePlugin({
        diffMarkdown: initialMarkdown || "",
        viewMode: "rich-text",
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
      collaborationPlugin(),
    ],
    [
      initialMarkdown,
      imageUploadHandler,
      imagePreviewHandler,
      collaborationPlugin,
    ]
  );

  const Messages = React.memo(function Messages() {
    const [error, setError] = useState("");
    // const [success, setSuccess] = useState(false);
    useEffect(() => {
      const interval = setInterval(() => {
        setError(errorRef.current);
      }, 100);
      return () => clearInterval(interval);
    }, []);

    return (
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => {
          errorRef.current = "";
        }}
      >
        <Alert
          onClose={() => {
            errorRef.current = "";
          }}
          severity="error"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>
    );
  });

  const SaveButton = React.memo(function SaveButton() {
    const [changed, setChanged] = useState(
      defaultContext && context.branch !== defaultContext.branch
    );
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    useEffect(() => {
      const interval = setInterval(() => {
        setChanged(changedRef.current);
      }, 100);
      return () => clearInterval(interval);
    }, []);

    return (
      <>
        <Fab
          color="primary"
          aria-label="save"
          disabled={!enabled || isLoading || !changed}
          style={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={async () => {
            setIsLoading(true);
            errorRef.current = "";
            try {
              const text = editorRef?.current?.getMarkdown() ?? "error";
              await editorSaveHandler(text ?? "");
              setSuccess(true);
            } catch (err: any) {
              errorRef.current = err.message;
            } finally {
              setIsLoading(false);
            }
          }}
        >
          {isLoading ? <CircularProgress size={24} /> : <SaveIcon />}
        </Fab>
        <Snackbar
          open={success}
          autoHideDuration={5000}
          onClose={() => setSuccess(false)}
        >
          <Alert
            onClose={() => setSuccess(false)}
            severity="info"
            sx={{ width: "100%" }}
          >
            Saved file
          </Alert>
        </Snackbar>
      </>
    );
  });

  return (
    <Paper
      sx={{
        px: "1%",
        maxHeight: "calc(100vh - 65px)",
        pt: "2%",
        pb: "2%",
        overflow: "hidden",
      }}
      elevation={0}
    >
      {defaultContext && context.branch === defaultContext.branch && (
        <Alert severity="info">
          The editor is in read-only mode until you change branch
        </Alert>
      )}
      <div ref={containerRef}>
        <StyledMDXEditor
          ref={editorRef}
          onChange={editorCallback}
          onError={(msg) => {
            errorRef.current = msg.error.toString();
          }}
          markdown={initialMarkdown || ""}
          plugins={editorPlugins}
          readOnly={defaultContext && context.branch === defaultContext.branch}
          autoFocus
        />
      </div>
      <SaveButton />
      <Messages />
    </Paper>
  );
});

export { Editor };
