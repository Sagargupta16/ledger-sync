import { PageContainer, PageHeader } from '@/components/ui'

import ImportHistory from './components/ImportHistory'
import MoneyManagerNotice from './components/MoneyManagerNotice'
import MoneyManagerReview from './components/MoneyManagerReview'
import UploadDropzone from './components/UploadDropzone'
import UploadFeedback from './components/UploadFeedback'
import UploadFormatPreview from './components/UploadFormatPreview'
import UploadReview from './components/UploadReview'
import { useUploadSync } from './useUploadSync'

export default function UploadSyncPage() {
  const {
    review,
    conflict,
    failure,
    success,
    selectedFileName,
    phase,
    isBusy,
    backup,
    handleFileSelect,
    handleForceReupload,
    handleRetryUpload,
    handleConfirmUpload,
    handleCancelReview,
    handleRetryAnalytics,
  } = useUploadSync()

  return (
    <PageContainer maxWidth="5xl">
      <PageHeader
        title="Upload & Sync"
        subtitle="Validate a complete INR export, review its scope, then replace your ledger"
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
          success={success}
          isBusy={isBusy}
          onForceReupload={handleForceReupload}
          onRetryUpload={handleRetryUpload}
          onRetryAnalytics={handleRetryAnalytics}
        />
        <MoneyManagerNotice
          notice={backup.notice}
          isBusy={isBusy}
          onForceReimport={backup.forceReimport}
          onRetry={backup.retry}
        />
        {review && (
          <UploadReview
            key={`${review.parsed.fileHash}-${review.force}`}
            review={review}
            isBusy={isBusy}
            onConfirm={handleConfirmUpload}
            onCancel={handleCancelReview}
          />
        )}
        {backup.review && (
          <MoneyManagerReview
            key={`${backup.review.fileName}-${backup.review.force}`}
            review={backup.review}
            isBusy={isBusy}
            onConfirm={backup.confirm}
            onCancel={backup.cancel}
          />
        )}
        <ImportHistory />
        <UploadFormatPreview />
      </div>
    </PageContainer>
  )
}
