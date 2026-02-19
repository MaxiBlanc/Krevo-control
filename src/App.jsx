import React, { useState, useEffect } from 'react';
import { db } from './Firebase/config'; 
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  doc, deleteDoc, updateDoc, writeBatch, getDocs, where 
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import './App.css';

const App = () => {
    const [categorias, setCategorias] = useState([]);
    const [productos, setProductos] = useState([]);
    const [categoriaActiva, setCategoriaActiva] = useState(null);
    
const CLAVE_CORRECTA = import.meta.env.VITE_APP_PASSWORD; // La clave se almacena en una variable de entorno    '; 
const [autorizado, setAutorizado] = useState(false);
const [password, setPassword] = useState('');
const [error, setError] = useState(false);

// 2. Función de validación
const verificarClave = (e) => {
    e.preventDefault();
    
    if (password === CLAVE_CORRECTA) {
        setAutorizado(true);
        setError(false);
    } else {
        setError(true); // Mostramos el mensaje de "Contraseña incorrecta"
        setPassword(''); // Limpiamos el input
    }
};


    useEffect(() => {
        const qCat = query(collection(db, "categorias"), orderBy("nombre", "asc"));
        const unsubscribeCat = onSnapshot(qCat, (snap) => {
            const cats = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setCategorias(cats);
            // Si hay categorías y ninguna está activa, activamos la primera automáticamente
            if (cats.length > 0 && !categoriaActiva) {
                setCategoriaActiva(cats[0].id);
            }
        });

        const unsubscribeProd = onSnapshot(collection(db, "productos"), (snap) => {
            setProductos(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        });

        return () => { unsubscribeCat(); unsubscribeProd(); };
    }, [categoriaActiva]);

    // --- LÓGICA DE CATEGORÍAS ---
    const abrirModalCategoria = async (cat = null) => {
        const esEdicion = !!cat;
        const { value: formValues } = await Swal.fire({
            title: esEdicion ? 'Editar Categoría' : 'Nueva Categoría',
            confirmButtonColor: '#398F82',
            showCancelButton: true,
            html:
                `<input id="swal-cat-name" class="swal2-input" placeholder="Nombre" value="${esEdicion ? cat.nombre : ''}">` +
                `<div style="margin-top:10px; font-size:0.8rem; color:#666">Imagen opcional:</div>` +
                `<input id="swal-cat-file" type="file" class="swal2-file" accept="image/*">`,
            preConfirm: () => {
                const nombre = document.getElementById('swal-cat-name').value;
                const archivo = document.getElementById('swal-cat-file').files[0];
                if (!nombre) return Swal.showValidationMessage('El nombre es obligatorio');
                return { nombre, archivo };
            }
        });
        if (formValues) guardarCategoria(formValues, cat);
    };

    const guardarCategoria = async (valores, catExistente) => {
        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            let urlImagen = catExistente?.imagen || '';
            if (valores.archivo) {
                const formData = new FormData();
                formData.append('file', valores.archivo);
                formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
                const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                urlImagen = data.secure_url;
            }

            if (catExistente) {
                const batch = writeBatch(db);
                if (valores.nombre !== catExistente.nombre) {
                    const q = query(collection(db, "productos"), where("categoria", "==", catExistente.nombre));
                    const snap = await getDocs(q);
                    snap.forEach(d => batch.update(d.ref, { categoria: valores.nombre }));
                }
                batch.update(doc(db, "categorias", catExistente.id), { nombre: valores.nombre, imagen: urlImagen });
                await batch.commit();
            } else {
                const docRef = await addDoc(collection(db, "categorias"), { nombre: valores.nombre, imagen: urlImagen });
                setCategoriaActiva(docRef.id); // Activar la nueva categoría creada
            }
            Swal.fire('Éxito', 'Categoría lista', 'success');
        } catch (e) { Swal.fire('Error', 'No se pudo guardar', 'error'); }
    };

    const eliminarCategoria = async (catId, catNombre) => {
        const result = await Swal.fire({ 
            title: `¿Eliminar ${catNombre}?`, 
            text: "Se borrarán todos los productos dentro de ella", 
            icon: 'warning', 
            showCancelButton: true, 
            confirmButtonColor: '#d33' 
        });
        if (result.isConfirmed) {
            const batch = writeBatch(db);
            const q = query(collection(db, "productos"), where("categoria", "==", catNombre));
            const snap = await getDocs(q);
            snap.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, "categorias", catId));
            await batch.commit();
            setCategoriaActiva(null);
            Swal.fire('Borrado', 'Categoría y productos eliminados', 'success');
        }
    };

    // --- LÓGICA DE PRODUCTOS ---
    const abrirModalProducto = async (prod = null, nombreCategoria = null) => {
        const esEdicion = !!prod;
        const { value: formValues } = await Swal.fire({
            title: esEdicion ? 'Editar Prenda' : 'Nueva Prenda',
            confirmButtonColor: '#398F82',
            showCancelButton: true,
            html:
                `<input id="swal-name" class="swal2-input" placeholder="Nombre" value="${esEdicion ? prod.nombre : ''}">` +
                `<input id="swal-price" type="number" class="swal2-input" placeholder="Precio" value="${esEdicion ? prod.precio : ''}">` +
                `<input id="swal-talle" class="swal2-input" placeholder="Talle" value="${esEdicion ? (prod.talle || '') : ''}">` +
                `<textarea id="swal-desc" class="swal2-textarea" placeholder="Descripción">${esEdicion ? (prod.descripcion || '') : ''}</textarea>` +
                `<div style="margin-top:15px; display:flex; justify-content:center; gap:10px;">
                    <label>¿Hay Stock?</label>
                    <input id="swal-stock" type="checkbox" ${(!esEdicion || prod.stock !== false) ? 'checked' : ''}>
                </div>` +
                `<input id="swal-files" type="file" class="swal2-file" accept="image/*" multiple>`,
            preConfirm: () => {
                const nombre = document.getElementById('swal-name').value;
                const precio = document.getElementById('swal-price').value;
                if (!nombre || !precio) return Swal.showValidationMessage('Nombre y Precio requeridos');
                return { 
                    nombre, 
                    precio, 
                    talle: document.getElementById('swal-talle').value, 
                    stock: document.getElementById('swal-stock').checked,
                    descripcion: document.getElementById('swal-desc').value,
                    archivos: document.getElementById('swal-files').files 
                };
            }
        });
        if (formValues) guardarProducto(formValues, prod, nombreCategoria);
    };

    const guardarProducto = async (valores, prodExistente, nombreCategoria) => {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            let urlsFinales = valores.archivos.length > 0 ? [] : (prodExistente?.imagenes || [prodExistente?.imagen || '']);
            
            if (valores.archivos.length > 0) {
                const promesas = Array.from(valores.archivos).map(async (file) => {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
                    const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    return data.secure_url;
                });
                urlsFinales = await Promise.all(promesas);
            }

            const datos = {
                nombre: valores.nombre,
                precio: parseFloat(valores.precio),
                talle: valores.talle,
                stock: valores.stock,
                descripcion: valores.descripcion,
                imagenes: urlsFinales,
                imagen: urlsFinales[0],
                categoria: prodExistente ? prodExistente.categoria : nombreCategoria
            };

            if (prodExistente) await updateDoc(doc(db, "productos", prodExistente.id), datos);
            else await addDoc(collection(db, "productos"), datos);

            Swal.fire('¡Listo!', 'Producto actualizado', 'success');
        } catch (e) { Swal.fire('Error', 'Error al guardar', 'error'); }
    };

    const eliminarProducto = async (id) => {
        const res = await Swal.fire({ title: '¿Borrar producto?', icon: 'warning', showCancelButton: true });
        if (res.isConfirmed) {
            await deleteDoc(doc(db, "productos", id));
            Swal.fire('Eliminado', '', 'success');
        }
    };

    // Obtenemos los datos de la categoría que está seleccionada actualmente
    const catActual = categorias.find(c => c.id === categoriaActiva);

    if (!autorizado) {
    return (
        <div className="login-screen">
            <form className="login-card" onSubmit={verificarClave}>
                <img src="/vite.jpeg" alt="Logo" className="header-logo-img" />
                <h2>Panel de Administración</h2>
                
                <input 
                    type="password" 
                    className="login-input-style" 
                    placeholder="Introduce la clave" 
                    value={password} 
                    onChange={(e) => {
                        setPassword(e.target.value);
                        if(error) setError(false); // Oculta el error mientras el usuario escribe
                    }} 
                />
                
                <button type="submit" className="btn-login">
                    Entrar
                </button>

                {/* MENSAJE DE ERROR CONDICIONAL */}
                {error && (
                    <p style={{ 
                        color: '#ff4d4d', 
                        fontSize: '14px', 
                        marginTop: '10px',
                        fontWeight: 'bold',
                        textAlign: 'center' 
                    }}>
                        ❌ Contraseña incorrecta. Inténtalo de nuevo.
                    </p>
                )}
            </form>
        </div>
    );
}

    return (
        <div className="admin-container">
            <div className="admin-header-logo">
                <img src="/vite.png" alt="Logo" className="header-logo-img" />
            </div>

            {/* BARRA HORIZONTAL DESLIZABLE */}
            <div className="categories-nav-wrapper">
                <div className="categories-nav">
                    {categorias.map(cat => (
                        <div 
                            key={cat.id} 
                            className={`cat-tab ${categoriaActiva === cat.id ? 'active' : ''}`}
                            onClick={() => setCategoriaActiva(cat.id)}
                        >
                            {cat.imagen && <img src={cat.imagen} alt="" style={{width: '18px', height: '18px', borderRadius: '50%'}} />}
                            {cat.nombre}
                        </div>
                    ))}
                </div>
                <button className="btn-new-cat" onClick={() => abrirModalCategoria()}>+</button>
            </div>

            {/* VISTA DE LA CATEGORÍA SELECCIONADA */}
            {catActual ? (
                <div className="admin-cat-card">
                    <div className="admin-cat-header">
                        <div className="cat-title-block">
                            <h2>{catActual.nombre}</h2>
                            <button className="btn-edit" onClick={() => abrirModalCategoria(catActual)}>✎</button>
                            <button className="btn-delete" onClick={() => eliminarCategoria(catActual.id, catActual.nombre)}>✕</button>
                        </div>
                        <button className="btn-add" onClick={() => abrirModalProducto(null, catActual.nombre)}>
                            + PRENDA
                        </button>
                    </div>

                    <div className="admin-prod-list">
                        {productos
                            .filter(p => p.categoria === catActual.nombre)
                            .map(p => (
                                <div key={p.id} className={`admin-prod-row ${p.stock === false ? 'out-of-stock-row' : ''}`}>
                                    <div className="prod-info-left">
                                        <span className="p-name">{p.nombre}</span>
                                        <span className="p-price">${p.precio}</span>
                                        <div style={{fontSize: '0.75rem', marginTop: '4px'}}>
                                            Talle: <strong>{p.talle || '-'}</strong> | 
                                            <span style={{color: p.stock !== false ? '#2ecc71' : '#e74c3c', fontWeight: 'bold', marginLeft: '5px'}}>
                                                {p.stock !== false ? '● STOCK' : '○ AGOTADO'}
                                            </span>
                                        </div>
                                        <p className="p-desc">{p.descripcion}</p>
                                    </div>
                                    <div className="prod-img-center">
                                        <img 
                                            src={p.imagenes?.[0] || p.imagen || 'https://via.placeholder.com/150'} 
                                            alt="" className="p-img" 
                                            style={{ filter: p.stock === false ? 'grayscale(1)' : 'none' }}
                                        />
                                    </div>
                                    <div className="prod-btns-right">
                                        <button className="btn-edit1" onClick={() => abrirModalProducto(p)}>✎</button>
                                        <button className="btn-delete1" onClick={() => eliminarProducto(p.id)}>✕</button>
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            ) : (
                <p style={{color: 'white', marginTop: '20px'}}>Crea una categoría para empezar.</p>
            )}
        </div>
    );
};

export default App;