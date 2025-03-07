import React, { useState } from "react";
import { useFormik } from "formik";
import { MdInfoOutline } from "react-icons/md";

const ErrorMessage = ({ error }) => <p className="error-text">{error}</p>;

export const LoginForm = ({ accounts, onLogin }) => {
    const [selectedAccount, setSelectedAccount] = useState(accounts[0]);

    const formik = useFormik({
        initialValues: {
            password: "",
        },
        onSubmit: (values) => {
            console.log("Form submitted with values:", values);
            onLogin(selectedAccount?.name, values.password);
        },
        validate: (values) => {
            const errors = {};
            return errors;
        },
    });

    return (
        <form onSubmit={formik.handleSubmit}>
            <div className="flex flex-col items-center">
                <h1 className="text-3xl">Login</h1>
                <div className="w-full mt-3">
                    <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-sm">
                            Name
                        </label>
                    </div>
                    <input 
                        type="text" 
                        readOnly 
                        value={selectedAccount?.name} 
                        className="bg-gray-100 input-field"
                    />
                </div>
                <div className="w-full mt-3">
                    <div className="flex justify-between items-center mb-1">
                        <label className="font-bold text-sm">
                            Password
                        </label>
                    </div>
                    <input 
                        type="password" 
                        required 
                        minLength={8} 
                        {...formik.getFieldProps("password")} 
                        className={`input-field ${formik.errors.password ? 'border-red-500' : ''}`}
                    />
                    <ErrorMessage error={formik.errors.password} />
                </div>
                <button 
                    className="btn-primary w-full mt-5" 
                    type="submit"
                >
                    Login
                </button>
            </div>
        </form>
    );
};