document.addEventListener('DOMContentLoaded', () => {
    const employeeTableBody = document.getElementById('employeeTableBody');
    const addEmployeeBtn = document.getElementById('addEmployeeBtn');
    const employeeModal = document.getElementById('employeeModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const employeeForm = document.getElementById('employeeForm');
    const modalTitle = document.getElementById('modalTitle');
    const employeeIdInput = document.getElementById('employeeId');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleInput = document.getElementById('role');
    const logoutButton = document.getElementById('logout-button');
    const paginationControls = document.getElementById('paginationControls');

    const API_BASE_URL = '/api/employees'; // Adjust if your API prefix is different

    let currentPage = 1;
    const pageSize = 10; // 或者从用户选择或配置中获取
    let currentEmployees = []; // 可以在编辑时从中查找，但获取单个员工更佳

    const getToken = () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.warn('No auth token found, redirecting to login.');
            window.location.href = '/html/login.html'; // Redirect to login if no token
            return null;
        }
        return token;
    };

    const fetchEmployees = async (page = 1) => {
        const token = getToken();
        if (!token) return;

        currentPage = page; // 更新当前页状态
        const url = `${API_BASE_URL}?page=${currentPage}&pageSize=${pageSize}`;
        employeeTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">正在加载...</td></tr>'; // Show loading state

        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.status === 401 || response.status === 403) { // Unauthorized or Forbidden
                localStorage.removeItem('authToken');
                localStorage.removeItem('username');
                localStorage.removeItem('userRole');
                window.location.href = '/html/login.html';
                return;
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch employees');
            }
            const data = await response.json();
            if (data.success && data.employees && data.pagination) {
                currentEmployees = data.employees; // Store current page data
                renderEmployees(data.employees);
                renderPagination(data.pagination);
            } else {
                console.error('Failed to fetch employees or pagination data:', data.message);
                alert('获取员工列表失败: ' + (data.message || '未知错误'));
                employeeTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: red;">加载失败</td></tr>';
                paginationControls.innerHTML = ''; // Clear pagination on error
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
            alert('获取员工列表时出错: ' + error.message);
            employeeTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: red;">加载出错</td></tr>';
            paginationControls.innerHTML = ''; // Clear pagination on error
        }
    };

    const renderEmployees = (employees) => {
        employeeTableBody.innerHTML = ''; // Clear existing rows or loading message
        if (!employees || employees.length === 0) {
            employeeTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">没有员工数据。</td></tr>';
            return;
        }
        employees.forEach(emp => {
            const row = employeeTableBody.insertRow();
            row.innerHTML = `
                <td>${emp.id}</td>
                <td>${emp.username}</td>
                <td>${emp.email}</td>
                <td>${emp.role}</td>
                <td>${new Date(emp.created_at).toLocaleString('zh-CN')}</td>
                <td class="table-actions">
                    <button data-id="${emp.id}" class="edit-btn action-button-secondary">编辑</button>
                    <button data-id="${emp.id}" class="delete-btn action-button-danger">删除</button>
                </td>
            `;
        });
    };

    const renderPagination = (pagination) => {
        paginationControls.innerHTML = ''; // Clear previous controls
        const { currentPage, totalPages, totalCount } = pagination;

        if (totalPages <= 1) return; // No need for pagination if only one page

        // Previous Button
        const prevButton = document.createElement('button');
        prevButton.textContent = '上一页';
        prevButton.classList.add('action-button-secondary'); // Use appropriate button style
        prevButton.disabled = currentPage === 1;
        prevButton.style.marginRight = '5px';
        prevButton.addEventListener('click', () => fetchEmployees(currentPage - 1));
        paginationControls.appendChild(prevButton);

        // Page Number Indicator (Example: "Page 1 of 5")
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页 (总计 ${totalCount} 条)`;
        pageInfo.style.margin = '0 10px';
        pageInfo.style.fontSize = '0.9em';
        pageInfo.style.color = 'var(--text-secondary)';
        paginationControls.appendChild(pageInfo);

        // Next Button
        const nextButton = document.createElement('button');
        nextButton.textContent = '下一页';
        nextButton.classList.add('action-button-secondary');
        nextButton.disabled = currentPage === totalPages;
        nextButton.style.marginLeft = '5px';
        nextButton.addEventListener('click', () => fetchEmployees(currentPage + 1));
        paginationControls.appendChild(nextButton);
    };

    const openModal = (employee = null) => {
        employeeForm.reset();
        if (employee) {
            modalTitle.textContent = '编辑员工';
            employeeIdInput.value = employee.id;
            usernameInput.value = employee.username;
            emailInput.value = employee.email;
            roleInput.value = employee.role;
            passwordInput.placeholder = '留空则不修改密码';
        } else {
            modalTitle.textContent = '添加员工';
            employeeIdInput.value = '';
            passwordInput.placeholder = '请输入密码';
        }
        employeeModal.style.display = 'block';
    };

    const closeModal = () => {
        employeeModal.style.display = 'none';
    };

    addEmployeeBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (event) => {
        if (event.target === employeeModal) {
            closeModal();
        }
    });

    employeeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const token = getToken();
        if (!token) return;

        const id = employeeIdInput.value;
        const employeeData = {
            username: usernameInput.value,
            email: emailInput.value,
            role: roleInput.value,
        };
        if (passwordInput.value) { // Only include password if provided
            employeeData.password = passwordInput.value;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE_URL}/${id}` : API_BASE_URL;

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(employeeData)
            });
            const result = await response.json();
            if (result.success) {
                alert(result.message || (id ? '员工更新成功！' : '员工添加成功！'));
                closeModal();
                fetchEmployees(currentPage);
            } else {
                alert('操作失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            console.error('Error saving employee:', error);
            alert('保存员工信息时出错: ' + error.message);
        }
    });

    employeeTableBody.addEventListener('click', async (event) => {
        const token = getToken();
        if (!token) return;

        if (event.target.classList.contains('edit-btn')) {
            const id = event.target.dataset.id;
            const employee = currentEmployees.find(emp => emp.id == id);
            if (employee) {
                openModal(employee);
            } else {
                console.warn(`Employee with ID ${id} not found in current page data.`);
                alert('无法获取要编辑的员工信息。');
            }
        }

        if (event.target.classList.contains('delete-btn')) {
            const id = event.target.dataset.id;
            if (confirm(`确定要删除 ID 为 ${id} 的员工吗？`)) {
                try {
                    const response = await fetch(`${API_BASE_URL}/${id}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    const result = await response.json();
                    if (result.success) {
                        alert(result.message || '员工删除成功！');
                        fetchEmployees(currentPage);
                    } else {
                        alert('删除失败: ' + (result.message || '未知错误'));
                    }
                } catch (error) {
                    console.error('Error deleting employee:', error);
                    alert('删除员工时出错: ' + error.message);
                }
            }
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            localStorage.removeItem('userRole');
            window.location.href = '/html/login.html';
            // If theme.js has a more sophisticated logout, call that instead.
        });
    }

    // Initial fetch of employees (start with page 1)
    fetchEmployees(1);
}); 