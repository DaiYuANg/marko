type ToastVariant = 'success' | 'error' | 'info'

export function useToast() {
  return (message: string, _variant: ToastVariant = 'info') => {
    console.log(message)
  }
}
