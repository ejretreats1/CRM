import { useState } from 'react';
import { X, FileText, Loader, CheckCircle, FileSignature, ChevronRight } from 'lucide-react';
import type { Owner } from '../../types';
import type { OwnerDocument } from '../../services/ownerDocuments';
import DrivePickerModal from './DrivePickerModal';
import type { PickedDriveFile } from './DrivePickerModal';

interface DocumentGeneratorModalProps {
  owner: Owner;
  onGenerated: (doc: OwnerDocument) => void;
  onSendForSignature: (fileUrl: string, fileName: string) => void;
  onClose: () => void;
}

type Step = 'pick-template' | 'fill-fields' | 'generating' | 'done' | 'error';

export default function DocumentGeneratorModal({
  owner, onGenerated, onSendForSignature, onClose,
}: DocumentGeneratorModalProps) {
  const [step, setStep] = useState<Step>('pick-template');
  const [showDrivePicker, setShowDrivePicker] = useState(true);
  const [template, setTemplate] = useState<PickedDriveFile | null>(null);

  const firstProp = owner.properties[0];
  const [ownerName, setOwnerName] = useState(owner.name);
  const [propertyAddress, setPropertyAddress] = useState(
    firstProp ? `${firstProp.address}, ${firstProp.city}, ${firstProp.state}`.replace(/, ,/g, ',').replace(/,\s*$/, '') : ''
  );
  const [commissionPct, setCommissionPct] = useState('');
  const [state, setState] = useState(firstProp?.state ?? '');
  const [documentName, setDocumentName] = useState(`${owner.name} - Management Agreement`);
  const [errorMsg, setErrorMsg] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState<OwnerDocument | null>(null);

  function handleTemplatePicked(files: PickedDriveFile[]) {
    setShowDrivePicker(false);
    const file = files[0];
    if (!file) return;
    setTemplate(file);
    setStep('fill-fields');
  }

  async function handleGenerate() {
    if (!template) return;
    setStep('generating');
    setErrorMsg('');
    try {
      const res = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateFileId: template.id,
          ownerName: ownerName.trim(),
          propertyAddress: propertyAddress.trim(),
          commissionPct: commissionPct.trim(),
          state: state.trim(),
          ownerId: owner.id,
          documentName: documentName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate document');

      const doc: OwnerDocument = {
        id: data.id,
        ownerId: data.ownerId,
        name: data.name,
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        fileSize: data.fileSize,
        storagePath: data.storagePath,
        uploadedAt: data.uploadedAt,
      };
      setGeneratedDoc(doc);
      onGenerated(doc);
      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed. Please try again.');
      setStep('error');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-teal-600" />
              <h3 className="font-bold text-slate-900 text-sm">Generate Contract</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="p-5">
            {/* Step: Fill fields */}
            {step === 'fill-fields' && template && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                  <FileText size={13} className="text-teal-600 flex-shrink-0" />
                  <p className="text-xs text-teal-700 font-medium truncate">{template.name}</p>
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Document name', value: documentName, set: setDocumentName, placeholder: 'Management Agreement' },
                    { label: 'Client name', value: ownerName, set: setOwnerName, placeholder: owner.name },
                    { label: 'Property address', value: propertyAddress, set: setPropertyAddress, placeholder: '123 Ocean Ave, Rehoboth Beach, DE' },
                    { label: 'Commission %', value: commissionPct, set: setCommissionPct, placeholder: '20' },
                    { label: 'Governing state', value: state, set: setState, placeholder: 'Delaware' },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                      <input
                        value={value}
                        onChange={e => set(e.target.value)}
                        placeholder={placeholder}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setStep('pick-template'); setShowDrivePicker(true); }}
                    className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    ← Change Template
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!ownerName.trim() || !commissionPct.trim()}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    Generate PDF <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Step: Generating */}
            {step === 'generating' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader size={28} className="text-teal-500 animate-spin" />
                <p className="text-sm font-medium text-slate-700">Filling in contract…</p>
                <p className="text-xs text-slate-400 text-center">Claude is reading the template and inserting the details</p>
              </div>
            )}

            {/* Step: Done */}
            {step === 'done' && generatedDoc && (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle size={24} className="text-emerald-600" />
                  </div>
                  <p className="font-semibold text-slate-900">Contract generated!</p>
                  <p className="text-xs text-slate-500 text-center">{generatedDoc.name} has been saved to this client's documents.</p>
                </div>

                <div className="flex gap-2">
                  <a
                    href={generatedDoc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-center"
                  >
                    View PDF
                  </a>
                  <button
                    onClick={() => { onSendForSignature(generatedDoc.fileUrl, generatedDoc.name); onClose(); }}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <FileSignature size={14} /> Send for Signature
                  </button>
                </div>
              </div>
            )}

            {/* Step: Error */}
            {step === 'error' && (
              <div className="space-y-4">
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{errorMsg}</p>
                <button
                  onClick={() => setStep('fill-fields')}
                  className="w-full border border-slate-200 text-slate-600 text-sm font-medium py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  ← Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drive picker overlay */}
      {showDrivePicker && (
        <DrivePickerModal
          onSelect={handleTemplatePicked}
          onClose={onClose}
        />
      )}
    </>
  );
}
