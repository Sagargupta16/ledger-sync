import { PageContainer, PageHeader } from '@/components/ui'

import UploadDropzone from './components/UploadDropzone'
import UploadFeedback from './components/UploadFeedback'
import UploadFormatPreview from './components/UploadFormatPreview'
import { useUploadSync } from './useUploadSync'

export default function UploadSyncPage() {
  const {
    conflict,
    failure,
    selectedFileName,
    phase,
    isBusy,
    handleFileSelect,
    handleForceReupload,
    handleRetryUpload,
  } = useUploadSync()

  return (
    <PageContainer maxWidth="5xl">
      <PageHeader
        title="Upload & Sync"
        subtitle="Import Excel or CSV transactions and reconcile them with your ledger"
      />

      <div className="space-y-5">
        <UploadDropzone
          phase={phase}
          selectedFileName={selectedFileName}
          isBusy={isBusy}
          onFileSelect={handleFileSelect}
        />
        <UploadFeedback
          conflict={conflict}
          failure={failure}
          isBusy={isBusy}
          onForceReupload={handleForceReupload}
          onRetryUpload={handleRetryUpload}
        />
        <UploadFormatPreview />
      </div>
    </PageContainer>
  )
}
