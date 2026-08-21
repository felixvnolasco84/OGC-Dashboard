import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  children: ReactNode;
  modalName?: string;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary intended to wrap modal components so that a rendering
 * error inside a single modal does NOT crash the entire application
 * (which would otherwise leave the user with a black screen).
 *
 * It also logs diagnostic information to the console so the underlying
 * issue can be identified.
 */
export class ModalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ModalErrorBoundary] Error in ${this.props.modalName || "modal"}:`,
      error,
      errorInfo
    );
  }

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
    this.props.onClose?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-inverse bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Ocurrió un error inesperado
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  No fue posible mostrar este formulario. Por favor cierra esta
                  ventana e inténtalo de nuevo. Si el problema persiste,
                  contacta al equipo de soporte con los siguientes detalles:
                </p>
                <pre className="mt-3 text-xs bg-background border border-border rounded p-3 overflow-auto max-h-48 text-red-700">
                  {this.state.error?.message || "Error desconocido"}
                </pre>
              </div>
              <button
                onClick={this.handleDismiss}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5 text-subtle-foreground" />
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={this.handleDismiss}
                className="px-4 py-2 bg-inverse text-on-color rounded-lg hover:bg-inverse transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ModalErrorBoundary;
