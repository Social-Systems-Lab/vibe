import { useState } from 'react'

interface Account {
  did: string
  name: string
  pictureUrl?: string
  requireAuthentication: string
}

interface CreateAccountProps {
  onAccountCreated: (account: Account) => void
  onCancel: () => void
}

const CreateAccount: React.FC<CreateAccountProps> = ({ onAccountCreated, onCancel }) => {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [authType, setAuthType] = useState<'PIN' | 'BIOMETRIC'>('PIN')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pictureFile, setPictureFile] = useState<File | null>(null)
  const [picturePreview, setPicturePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setPictureFile(file)
      
      // Create a preview
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          setPicturePreview(event.target.result)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        setError('Please enter a name')
        return
      }
      setError(null)
      setStep(2)
    } else if (step === 2) {
      if (authType === 'PIN') {
        if (!pin) {
          setError('Please enter a PIN')
          return
        }
        if (pin !== confirmPin) {
          setError('PINs do not match')
          return
        }
        if (pin.length < 4) {
          setError('PIN must be at least 4 digits')
          return
        }
      }
      setError(null)
      setStep(3)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
      setError(null)
    } else {
      onCancel()
    }
  }

  const handleCreateAccount = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Convert pictureFile to file path if available
      // In a real app, you'd save the file to a location first
      // For now, we'll just use the data URL since Electron can handle it
      let picturePath = picturePreview

      // Create the account
      const account = await window.api.accounts.create(
        name,
        authType,
        picturePath,
        authType === 'PIN' ? pin : undefined
      )
      
      onAccountCreated(account)
    } catch (err) {
      console.error('Error creating account:', err)
      setError('Failed to create account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-100">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Create Account</h1>
          <div className="text-sm text-gray-500">Step {step} of 3</div>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {step === 1 && (
          <div>
            <div className="mb-4">
              <label htmlFor="name" className="block text-gray-700 text-sm font-bold mb-2">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                placeholder="Enter your name"
              />
            </div>
          </div>
        )}
        
        {step === 2 && (
          <div>
            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Authentication Method
              </label>
              <div className="mb-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio"
                    value="PIN"
                    checked={authType === 'PIN'}
                    onChange={() => setAuthType('PIN')}
                  />
                  <span className="ml-2">PIN</span>
                </label>
                <label className="inline-flex items-center ml-6">
                  <input
                    type="radio"
                    className="form-radio"
                    value="BIOMETRIC"
                    checked={authType === 'BIOMETRIC'}
                    onChange={() => setAuthType('BIOMETRIC')}
                  />
                  <span className="ml-2">Biometric (if available)</span>
                </label>
              </div>
              
              {authType === 'PIN' && (
                <>
                  <div className="mb-4">
                    <label htmlFor="pin" className="block text-gray-700 text-sm font-bold mb-2">
                      PIN (min 4 digits)
                    </label>
                    <input
                      type="password"
                      id="pin"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      placeholder="Enter PIN"
                      maxLength={6}
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="confirmPin" className="block text-gray-700 text-sm font-bold mb-2">
                      Confirm PIN
                    </label>
                    <input
                      type="password"
                      id="confirmPin"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      placeholder="Confirm PIN"
                      maxLength={6}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        {step === 3 && (
          <div>
            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Profile Picture (Optional)
              </label>
              <div className="flex items-center justify-center mb-4">
                <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                  {picturePreview ? (
                    <img src={picturePreview} alt="Profile preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-5xl text-gray-400">{name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
              <div className="flex justify-center">
                <label className="cursor-pointer bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">
                  <span>Choose Picture</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Account Summary</h3>
              <div className="bg-gray-50 p-4 rounded">
                <div className="mb-2">
                  <span className="font-medium">Name:</span> {name}
                </div>
                <div>
                  <span className="font-medium">Authentication:</span> {authType === 'PIN' ? 'PIN' : 'Biometric'}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-between">
          <button
            onClick={handleBack}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          
          {step < 3 ? (
            <button
              onClick={handleNext}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleCreateAccount}
              disabled={loading}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateAccount