import { useState, useCallback } from "react";
import { useFormik } from "formik";
import { MdInfoOutline } from "react-icons/md";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { defaultPicture } from "./AccountManager";

const ErrorMessage = ({ error }) => <p className="error-text">{error}</p>;

const Tooltip = ({ label, children }) => (
    <div className="group relative flex items-center">
        {children}
        <div className="absolute z-10 hidden group-hover:block top-0 left-full ml-2 w-64 p-2 bg-gray-800 text-white text-xs rounded shadow-lg">
            {label}
        </div>
    </div>
);

export const CreateAccountForm = ({ onCreateAccount }) => {
    const [accountPicture, setAccountPicture] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    const openImagePicker = () => {
        document.getElementById("imageInput").click();
    };

    const onImagePicked = (event) => {
        const file = event.target.files[0];
        if (file) {
            const objectURL = URL.createObjectURL(file);
            setAccountPicture(objectURL);
            console.log("Image picked", objectURL);
        } else {
            console.log("File null");
        }
    };

    const formik = useFormik({
        initialValues: {
            name: "",
            password: "",
            confirmpassword: "",
        },
        onSubmit: (values) => {
            console.log("Form submitted with values:", values);
            const picture = document.getElementById("imageInput").files[0];
            onCreateAccount(values.name, values.password, picture.path);
        },
        validate: (values) => {
            const errors = {};
            if (!values.name) {
                errors.name = "Name is required";
            }
            if (!values.password) {
                errors.password = "Password is required";
            }
            if (values.password !== values.confirmpassword) {
                errors.confirmpassword = "Passwords must match";
            }
            return errors;
        },
    });

    return (
        <form onSubmit={formik.handleSubmit}>
            <div className="flex flex-col items-center">
                <h1 className="text-3xl mb-3">Create your account</h1>
                
                <div className="w-full mt-3">
                    <div className="flex items-center mb-2">
                        <span className="form-label mr-1">Picture</span>
                    </div>
                    <div className="flex flex-row items-center">
                        <img
                            src={accountPicture ?? defaultPicture}
                            alt="Account Picture"
                            className="w-20 h-20 rounded-full object-cover cursor-pointer"
                            onClick={openImagePicker}
                        />
                        <div className="ml-5 flex flex-col items-start">
                            <button 
                                type="button"
                                className="btn-outline text-sm w-32"
                                onClick={openImagePicker}
                            >
                                Choose Picture
                            </button>
                        </div>
                        <input type="file" id="imageInput" accept="image/*" onChange={onImagePicked} className="hidden" />
                    </div>
                </div>
                
                <div className="w-full mt-4">
                    <div className="flex items-center mb-2">
                        <span className="form-label mr-1">Name</span>
                        <Tooltip label="Name of your account, such as full name, nickname or organization.">
                            <div><MdInfoOutline className="text-gray-500" /></div>
                        </Tooltip>
                    </div>
                    <input 
                        type="text" 
                        required 
                        className="input-field"
                        {...formik.getFieldProps("name")} 
                    />
                    <ErrorMessage error={formik.errors.name} />
                </div>
                
                <div className="w-full mt-4">
                    <div className="flex items-center mb-2">
                        <span className="form-label mr-1">Password</span>
                        <Tooltip label="Your password grants access to your account and is used to encrypt your data. It's stored solely on your device. There's no recovery if lost, so choose a memorable one and safeguard it.">
                            <div><MdInfoOutline className="text-gray-500" /></div>
                        </Tooltip>
                    </div>
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"}
                            required 
                            minLength={6}
                            className="input-field pr-10"
                            {...formik.getFieldProps("password")}
                        />
                        <button
                            type="button"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                        >
                            {showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
                        </button>
                    </div>
                    <ErrorMessage error={formik.errors.password} />
                </div>
                
                <div className="w-full mt-4">
                    <div className="flex items-center mb-2">
                        <span className="form-label">Confirm password</span>
                    </div>
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"}
                            required 
                            minLength={6}
                            className="input-field pr-10"
                            {...formik.getFieldProps("confirmpassword")}
                        />
                        <button
                            type="button"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                        >
                            {showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
                        </button>
                    </div>
                    <ErrorMessage error={formik.errors.confirmpassword} />
                </div>
                
                <button className="btn-primary w-full mt-8" type="submit">
                    Create Account
                </button>
            </div>
        </form>
    );
};