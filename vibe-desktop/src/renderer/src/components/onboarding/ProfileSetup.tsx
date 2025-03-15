import React, { useState, useRef } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { BsPersonCircle } from 'react-icons/bs';

interface ProfileSetupProps {
  onNext: (values: { name: string; password: string; picturePath?: string }) => void;
  onBack: () => void;
}

const ProfileSetup: React.FC<ProfileSetupProps> = ({ onNext, onBack }) => {
  const [picturePath, setPicturePath] = useState<string | undefined>();
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const formik = useFormik({
    initialValues: {
      name: '',
      password: '',
      confirmPassword: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      password: Yup.string()
        .min(8, 'Password must be at least 8 characters')
        .required('Password is required'),
      confirmPassword: Yup.string()
        .oneOf([Yup.ref('password')], 'Passwords must match')
        .required('Confirm password is required'),
    }),
    onSubmit: (values) => {
      onNext({
        name: values.name,
        password: values.password,
        picturePath,
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPicturePath(file.path);
    }
  };

  const handleSelectPicture = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col h-full max-w-md mx-auto px-6 py-10">
      <div className="mb-6">
        <button 
          onClick={onBack}
          className="text-blue-600 hover:text-blue-800 flex items-center"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold mt-4 mb-2">Create Your Profile</h1>
        <p className="text-gray-600">
          This is your personal space on Vibe. Your profile stays on this device.
        </p>
      </div>

      <form onSubmit={formik.handleSubmit} className="flex-1 flex flex-col">
        <div className="mb-6 flex flex-col items-center">
          <div 
            className="w-28 h-28 rounded-full bg-gray-200 overflow-hidden mb-2 flex items-center justify-center cursor-pointer"
            onClick={handleSelectPicture}
          >
            {picturePath ? (
              <img 
                src={`file://${picturePath}`} 
                alt="Profile" 
                className="w-full h-full object-cover"
              />
            ) : (
              <BsPersonCircle className="w-20 h-20 text-gray-400" />
            )}
          </div>
          <button 
            type="button" 
            onClick={handleSelectPicture}
            className="text-blue-600 text-sm"
          >
            Select a picture
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="Your name or nickname"
            className={`input-field ${formik.touched.name && formik.errors.name ? 'border-red-500' : ''}`}
            {...formik.getFieldProps('name')}
          />
          {formik.touched.name && formik.errors.name && (
            <div className="text-red-500 text-sm mt-1">{formik.errors.name}</div>
          )}
        </div>
        
        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a strong password"
              className={`input-field pr-10 ${formik.touched.password && formik.errors.password ? 'border-red-500' : ''}`}
              {...formik.getFieldProps('password')}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {formik.touched.password && formik.errors.password && (
            <div className="text-red-500 text-sm mt-1">{formik.errors.password}</div>
          )}
        </div>
        
        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm your password"
            className={`input-field ${formik.touched.confirmPassword && formik.errors.confirmPassword ? 'border-red-500' : ''}`}
            {...formik.getFieldProps('confirmPassword')}
          />
          {formik.touched.confirmPassword && formik.errors.confirmPassword && (
            <div className="text-red-500 text-sm mt-1">{formik.errors.confirmPassword}</div>
          )}
        </div>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Your password protects your account on this device. 
            There's no password reset option, so be sure to remember it!
          </p>
        </div>
        
        <div className="mt-auto">
          <button 
            type="submit"
            className="btn-primary w-full py-3"
            disabled={formik.isSubmitting}
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileSetup;